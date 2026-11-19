import { Feedback } from "./Feedback";
export function RequestError({ message }: { message: string }) {
  return message ? <Feedback tone="error">{message}</Feedback> : null;
}
