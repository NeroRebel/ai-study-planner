import { Sparkles } from "lucide-react";
import type { ChatMessage } from "../../state/assistantStore";
import { motion } from "motion/react";

export function AssistantMessage({
  message,
}: {
  message: ChatMessage;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }} className={"assistant-message message-" + message.role}>
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
    </motion.div>
  );
}
