from copy import deepcopy
from datetime import UTC, datetime, time, timedelta
from decimal import Decimal
import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import SQLAlchemyError
from app.models import Subject
from app.models.enums import Priority, StudySessionStatus as Status, TaskStatus
from app.schemas.replanning import ReplanApply, ReplanRequest
from app.services import replanning
from app.services.time_rules import interval, local_instant
from tests.test_risk_engine import DAY, NOW, SUBJECT, TZ, task, window, session


def managed(work, **changes):
    return session(work, origin='SCHEDULER', **changes)


def calculate(tasks, windows=(), sessions=(), request=None, current=NOW):
    return replanning.calculate_replan(tasks, [Subject(id=SUBJECT, name='Course')], windows, sessions,
        request or ReplanRequest(date_from=DAY, date_to=DAY+timedelta(days=9)), current, TZ)


def changed(p):return len(p.sessions_created)+len(p.sessions_moved)+len(p.sessions_removed)
def final(p):return [*p.sessions_kept,*p.sessions_created,*(m.after for m in p.sessions_moved)]
def valid(p,tasks):
    lookup={t.id:t for t in tasks};items=final(p)
    for i,s in enumerate(items):
        if s.status==Status.PLANNED:
            _,end,duration=interval(s.date,s.start_time,s.end_time,TZ)
            assert end<=lookup[s.task_id].deadline and duration==s.planned_minutes and duration>0
        assert not any(replanning.overlaps(s,other) for other in items[i+1:])


def test_noop_keeps_exact_reservation():
    work=task(hours='1');old=managed(work);p=calculate([work],[window()],[old])
    assert changed(p)==0 and p.sessions_kept[0].id==old.id and p.unscheduled_minutes==0


def test_skipped_session_replaced_but_history_preserved():
    work=task(hours='1');old=managed(work,day=DAY-timedelta(days=1),status=Status.MISSED)
    p=calculate([work],[window()],[old])
    assert len(p.sessions_created)==1 and p.sessions_created[0].planned_minutes==60
    assert p.sessions_kept[0].id==old.id


def test_partial_reschedules_only_canonical_remaining_work():
    work=task(hours='1',remaining_hours=Decimal('.5'),progress=50)
    old=managed(work,day=DAY-timedelta(days=1),status=Status.PARTIALLY_COMPLETED,completed_minutes=30)
    p=calculate([work],[window()],[old])
    assert sum(s.planned_minutes for s in p.sessions_created)==30
    assert p.sessions_kept[0].completed_minutes==30 and work.progress==50


@pytest.mark.parametrize('status,completed',[(Status.COMPLETED,60),(Status.MISSED,0),(Status.PLANNED,0)])
def test_past_completed_and_unreported_history_preserved(status,completed):
    work=task(hours='1');old=managed(work,day=DAY-timedelta(days=1),status=status,completed_minutes=completed)
    assert any(s.id==old.id for s in calculate([work],[window()],[old]).sessions_kept)


def test_future_manual_and_ongoing_generated_preserved():
    work=task(hours='2');manual=session(work,origin='MANUAL')
    assert calculate([work],[window()],[manual]).sessions_kept[0].id==manual.id
    ongoing=managed(work,start=time(7),end=time(9))
    assert changed(calculate([work],[window(time(7),time(12))],[ongoing]))==0


def test_unrelated_valid_generated_stays_when_free_capacity_suffices():
    a,b=task(hours='1'),task(id=2,hours='1');old=managed(b)
    p=calculate([a,b],[window()],[old])
    assert not p.sessions_moved and p.sessions_kept[0].id==old.id and len(p.sessions_created)==1


def test_deadline_earlier_moves_only_invalid_generated():
    work=task(hours='1',deadline=local_instant(DAY,time(10),TZ));old=managed(work,start=time(11),end=time(12))
    p=calculate([work],[window()],[old]);assert len(p.sessions_moved)==1
    assert p.sessions_moved[0].session_id==old.id and p.sessions_moved[0].after.start_time==time(9)
    valid(p,[work])


def test_deadline_later_does_not_move_valid_work():
    work=task(hours='1',deadline=local_instant(DAY+timedelta(days=9),time(20),TZ))
    assert changed(calculate([work],[window()],[managed(work)]))==0


@pytest.mark.parametrize('same_deadline',[False,True])
def test_new_urgent_or_priority_increase_displaces_lower_generated(same_deadline):
    deadline=local_instant(DAY,time(10),TZ)
    urgent=task(hours='1',deadline=deadline,priority=Priority.HIGH)
    low=task(id=2,hours='1',priority=Priority.LOW,deadline=deadline if same_deadline else local_instant(DAY+timedelta(days=1),time(20),TZ))
    old=managed(low);p=calculate([low,urgent],[window(end=time(11))],[old])
    assert any(s.task_id==urgent.id and s.start_time==time(9) for s in p.sessions_created)
    assert 'LOWER_RANKED_GENERATED_WORK_DISPLACED' in p.reasons;valid(p,[urgent,low])
    if same_deadline:assert p.unscheduled_minutes==60 and p.sessions_removed[0].id==old.id
    else:assert p.sessions_moved[0].session_id==old.id and p.unscheduled_minutes==0


@pytest.mark.parametrize('status',[TaskStatus.COMPLETED,TaskStatus.CANCELLED])
def test_closed_task_removes_only_future_generated(status):
    work=task(hours='1',status=status);auto=managed(work);history=managed(work,id=801,day=DAY-timedelta(days=1),status=Status.MISSED)
    p=calculate([work],[window()],[auto,history]);assert p.sessions_removed[0].id==auto.id
    assert p.sessions_kept[0].id==history.id and not p.sessions_created


def test_removed_availability_moves_generated_and_keeps_manual():
    work=task(hours='2');old=managed(work);manual=session(work,id=801,start=time(12),end=time(13),origin='MANUAL')
    p=calculate([work],[window(time(11),time(13))],[old,manual])
    assert p.sessions_moved[0].after.start_time==time(11) and any(s.id==manual.id for s in p.sessions_kept)
    valid(p,[work])


def test_added_availability_fills_deficit():
    work=task(hours='2');p=calculate([work],[window(end=time(11))],[managed(work)])
    assert len(p.sessions_created)==1 and not p.sessions_moved and p.unscheduled_minutes==0


def test_manual_never_displaced():
    urgent=task(hours='1',deadline=local_instant(DAY,time(10),TZ));low=task(id=2,hours='1');old=session(low,origin='MANUAL')
    p=calculate([urgent,low],[window(end=time(11))],[old])
    assert p.unscheduled_minutes==60 and changed(p)==0 and p.sessions_kept[0].id==old.id


def test_excess_generated_effort_trimmed_without_progress_mutation():
    work=task(hours='2',remaining_hours=Decimal('1.5'),progress=25)
    old=[managed(work),managed(work,id=801,start=time(10),end=time(11))];p=calculate([work],[window()],old)
    assert sum(s.planned_minutes for s in final(p))==90 and any(s.id==old[0].id for s in p.sessions_kept)
    assert work.progress==25 and work.remaining_hours==Decimal('1.5');valid(p,[work])


def test_generated_conflicts_repaired_deterministically():
    a,b=task(hours='1'),task(id=2,hours='1');old=[managed(a),managed(b,id=801)]
    p=calculate([a,b],[window()],old);assert len(p.sessions_moved)==1
    assert p.model_dump()==calculate([b,a],[window()],list(reversed(old))).model_dump();valid(p,[a,b])


def test_insufficient_capacity_returns_partial_and_risk_before_after():
    work=task(hours='4');p=calculate([work],[window(end=time(11))])
    assert p.unscheduled_minutes==120 and p.tasks_partially_scheduled==1
    assert p.risk_before.tasks[0].level==p.risk_after.tasks[0].level=='HIGH'
    assert p.risk_after.tasks[0].scheduled_minutes==120


def test_risk_before_after_uses_existing_thresholds():
    work=task(hours='1',deadline=local_instant(DAY+timedelta(days=3),time(20),TZ));p=calculate([work],[window(end=time(11))])
    assert p.risk_before.tasks[0].scheduled_minutes==0 and p.risk_after.tasks[0].scheduled_minutes==60


def test_preview_never_mutates_input_models():
    work=task(hours='1');old=managed(work,start=time(11),end=time(12));windows=[window(time(9),time(10))];objects=[work,old,*windows]
    def snapshot():return [{c.key:deepcopy(getattr(o,c.key)) for c in inspect(type(o)).columns} for o in objects]
    before=snapshot();calculate([work],windows,[old]);assert snapshot()==before


@pytest.mark.parametrize('day',[DAY.replace(month=3,day=31),DAY.replace(month=10,day=27)])
def test_dst_shared_safe_minutes(day):
    work=task(hours='4',deadline=local_instant(day+timedelta(days=2),time(20),TZ))
    p=calculate([work],[window(time(1),time(4),day)],request=ReplanRequest(date_from=day,date_to=day),current=local_instant(day,time(0),TZ))
    assert sum(s.planned_minutes for s in p.sessions_created)==119 and any(w.code=='DST_TIME_SKIPPED' for w in p.warnings)
    valid(p,[work])


def test_timezone_cutoff():
    work=task(hours='1',deadline=datetime(2030,1,7,8,30,tzinfo=UTC));p=calculate([work],[window(end=time(11))])
    assert p.sessions_created[0].planned_minutes==30 and p.unscheduled_minutes==30


def api_preview(client):
    response=client.post('/api/planner/replan/preview',json={'date_from':'2099-01-05','date_to':'2099-01-05'})
    assert response.status_code==200,response.text
    return response.json()
def body(p):return {**p['request'],**{k:p[k] for k in ['evaluated_at','fingerprint','plan_digest']}}
def snapshot_api(client):return {g:client.get('/api/'+g).json() for g in ['subjects','tasks','availability','study-sessions']}


def test_preview_read_only_apply_persists_and_repeat_is_safe(client,task,window):
    before=snapshot_api(client);p=api_preview(client);assert snapshot_api(client)==before and p['sessions_created']
    response=client.post('/api/planner/replan/apply',json=body(p));assert response.status_code==200,response.text
    sessions=client.get('/api/study-sessions').json()
    assert all(s['origin']=='SCHEDULER' for s in sessions) and len(sessions)==len(p['sessions_created'])
    assert client.get('/api/tasks').json()==before['tasks']
    assert client.post('/api/planner/replan/apply',json=body(p)).status_code==409
    p=api_preview(client);assert not p['sessions_created'] and not p['sessions_moved'] and not p['sessions_removed']
    assert client.post('/api/planner/replan/apply',json=body(p)).status_code==200


@pytest.mark.parametrize('resource',['task','availability','session'])
def test_stale_preview_rejected_after_core_change(client,task,window,resource):
    p=api_preview(client)
    if resource=='task':response=client.patch('/api/tasks/'+task['id'],json={'priority':'LOW'})
    elif resource=='availability':response=client.patch('/api/availability/'+window['id'],json={'end_time':'22:00'})
    else:response=client.post('/api/study-sessions',json={'task_id':task['id'],'date':window['date'],'start_time':'17:00','end_time':'18:00'})
    assert response.status_code in (200,201),response.text
    before=snapshot_api(client);assert client.post('/api/planner/replan/apply',json=body(p)).status_code==409
    assert snapshot_api(client)==before


def test_expired_or_tampered_preview_rejected(client,task,window):
    p=api_preview(client);data=body(p);data['plan_digest']='0'*64
    assert client.post('/api/planner/replan/apply',json=data).status_code==409
    data=body(p);data['evaluated_at']='2000-01-01T00:00:00Z'
    assert client.post('/api/planner/replan/apply',json=data).status_code==409


def test_transaction_rollback_on_failure(client,task,window,db_factory,monkeypatch):
    p=api_preview(client);before=snapshot_api(client)
    with db_factory() as db:
        def fail():raise SQLAlchemyError('simulated')
        monkeypatch.setattr(db,'commit',fail)
        with pytest.raises(SQLAlchemyError):replanning.apply(db,ReplanApply(**body(p)),TZ)
    assert snapshot_api(client)==before


def test_generated_work_allows_availability_edit_then_preview(client,task,window):
    p=api_preview(client);assert client.post('/api/planner/replan/apply',json=body(p)).status_code==200
    assert client.delete('/api/availability/'+window['id']).status_code==204
    p=api_preview(client);assert p['sessions_removed'] and p['unscheduled_minutes']==300
    assert client.post('/api/planner/replan/apply',json=body(p)).status_code==200


def test_manual_placement_of_generated_session_transfers_ownership(client,task,window):
    p=api_preview(client);client.post('/api/planner/replan/apply',json=body(p));item=client.get('/api/study-sessions').json()[0]
    client.post('/api/availability',json={'date':'2099-01-06','start_time':'17:00','end_time':'21:00'})
    response=client.patch('/api/study-sessions/'+item['id'],json={'date':'2099-01-06'})
    assert response.status_code==200,response.text
    assert response.json()['origin']=='MANUAL'


def test_preview_and_noop_apply_do_not_issue_dml(client,task,window,db_factory):
    from sqlalchemy import event
    p=api_preview(client);client.post('/api/planner/replan/apply',json=body(p))
    statements=[];engine=db_factory.kw['bind']
    def capture(_conn,_cursor,sql,_params,_ctx,_many):statements.append(sql)
    event.listen(engine,'before_cursor_execute',capture)
    try:
        p=api_preview(client)
        assert client.post('/api/planner/replan/apply',json=body(p)).status_code==200
    finally:event.remove(engine,'before_cursor_execute',capture)
    assert not any(sql.lstrip().upper().startswith(('INSERT','UPDATE','DELETE')) for sql in statements)


def test_crossed_session_start_rejects_apply(client,task,window,monkeypatch):
    fixed=datetime(2099,1,5,15,59,30,tzinfo=UTC)
    monkeypatch.setattr(replanning,'now',lambda:fixed)
    p=api_preview(client)
    monkeypatch.setattr(replanning,'now',lambda:fixed+timedelta(minutes=1))
    assert client.post('/api/planner/replan/apply',json=body(p)).status_code==409
    assert not client.get('/api/study-sessions').json()


def test_urgent_task_risk_reduces_after_displacement():
    urgent=task(hours='1',priority=Priority.HIGH,deadline=local_instant(DAY,time(10),TZ))
    low=task(id=2,hours='1',priority=Priority.LOW)
    p=calculate([urgent,low],[window(end=time(11))],[managed(low)])
    before=next(r for r in p.risk_before.tasks if r.task_id==urgent.id)
    after=next(r for r in p.risk_after.tasks if r.task_id==urgent.id)
    assert before.level=='HIGH' and after.level=='MEDIUM'


def test_out_of_horizon_generated_reservation_stays_fixed():
    work=task(hours='1');old=managed(work,day=DAY+timedelta(days=2))
    p=calculate([work],[window()], [old], request=ReplanRequest(date_from=DAY,date_to=DAY))
    assert changed(p)==0 and p.sessions_kept[0].id==old.id


def test_invalid_fixed_reservations_are_warned_not_erased():
    work=task(hours='1',remaining_hours=Decimal('.5'),progress=50)
    p=calculate([work],[window()],[session(work,origin='MANUAL')])
    assert changed(p)==0 and p.sessions_kept
    assert any(w.code=='PRESERVED_EXCESS_RESERVATION' for w in p.warnings)


def test_selected_task_deleted_after_preview_returns_stale_conflict(client,task,window):
    response=client.post('/api/planner/replan/preview',json={'date_from':'2099-01-05','date_to':'2099-01-05','task_ids':[task['id']]})
    assert response.status_code==200
    assert client.delete('/api/tasks/'+task['id']).status_code==204
    before=snapshot_api(client)
    assert client.post('/api/planner/replan/apply',json=body(response.json())).status_code==409
    assert snapshot_api(client)==before


def test_apply_moves_released_sessions_with_stable_ids_and_creation_times(client,task,window):
    p=api_preview(client);assert client.post('/api/planner/replan/apply',json=body(p)).status_code==200
    original={s['id']:s for s in client.get('/api/study-sessions').json()}
    assert client.delete('/api/availability/'+window['id']).status_code==204
    assert client.post('/api/availability',json={'date':'2099-01-06','start_time':'17:00','end_time':'21:00'}).status_code==201
    response=client.post('/api/planner/replan/preview',json={'date_from':'2099-01-05','date_to':'2099-01-06'})
    assert response.status_code==200,response.text
    p=response.json();assert len(p['sessions_moved'])==4 and not p['sessions_removed'] and not p['sessions_created']
    assert client.post('/api/planner/replan/apply',json=body(p)).status_code==200
    current=client.get('/api/study-sessions').json()
    assert {s['id'] for s in current}==set(original)
    assert all(s['date']=='2099-01-06' and s['created_at']==original[s['id']]['created_at'] for s in current)
