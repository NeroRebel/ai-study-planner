export function RequestError({ message }: { message: string }) {
  return message ? <p role="alert" className="form-error">{message}</p> : null;
}
