import { Sparkles } from "lucide-react";
import type { ChatMessage } from "../../state/assistantStore";

export function AssistantMessage({
  message,
}: {
  message: ChatMessage;
}) {
  return (
    <div className={"assistant-message message-" + message.role}>
      {message.role === "assistant" && (
        <span className="message-avatar" aria-hidden="true">
          <Sparkles size={17} />
        </span>
      )}
      <div className="message-bubble">
        <span className="sr-only">
          {message.role === "assistant" ? "Assistant: " : "You: "}
        </span>
        <p>{message.content}</p>
      </div>
    </div>
  );
}
