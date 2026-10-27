"use client";

import { Check, LoaderCircle, Undo2 } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { setMessageStatusAction, type MessageActionState } from "../../admin-actions";
import type { MessageStatus } from "../../admin-data";

/*
 * Marks one message handled (or new again). It only collects the click: the
 * action re-authorizes on the server and in the database. Labels arrive as
 * props so admin strings are not shipped in the client message bundle.
 */

const IDLE: MessageActionState = { status: "idle" };

type Labels = Record<"markHandled" | "markNew" | "errorGeneric" | "errorForbidden" | "errorNotFound", string>;

export function MessageStatusForm({
  messageId,
  status,
  labels,
}: {
  messageId: string;
  status: MessageStatus;
  labels: Labels;
}) {
  const [state, action, pending] = useActionState(setMessageStatusAction, IDLE);
  const toStatus: MessageStatus = status === "new" ? "handled" : "new";

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="messageId" value={messageId} />
      <input type="hidden" name="toStatus" value={toStatus} />
      <Button
        type="submit"
        size="sm"
        variant={toStatus === "handled" ? "primary" : "outline"}
        disabled={pending}
      >
        {pending ? (
          <LoaderCircle aria-hidden className="animate-spin" />
        ) : toStatus === "handled" ? (
          <Check aria-hidden />
        ) : (
          <Undo2 aria-hidden />
        )}
        {toStatus === "handled" ? labels.markHandled : labels.markNew}
      </Button>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {labels[state.message]}
        </p>
      )}
    </form>
  );
}
