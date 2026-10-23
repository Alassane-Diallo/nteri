import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { SendIcon } from "~/components/icons";

interface ComposerProps {
  placeholder: string;
  onSend: (body: string) => void;
}

export function Composer({ placeholder, onSend }: ComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0;

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`;
  }, [value]);

  const submit = () => {
    if (!canSend) {
      return;
    }

    onSend(value);
    setValue("");
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="composer-safe shrink-0 border-t border-line bg-surface px-3 pt-3 md:px-5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="mx-auto flex w-full max-w-3xl items-end gap-2"
      >
        <div className="flex min-w-0 flex-1 items-end rounded-[22px] border border-line bg-surface-muted px-4 py-2 transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15">
          <label htmlFor="message-input" className="sr-only">
            Votre message
          </label>
          <textarea
            id="message-input"
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-describedby="composer-hint"
            autoComplete="off"
            className="max-h-[132px] min-h-9 w-full resize-none bg-transparent py-1.5 text-[14px] leading-6 text-ink outline-none placeholder:text-muted"
          />
        </div>

        <button
          type="submit"
          disabled={!canSend}
          aria-label="Envoyer le message"
          className="button-brand grid size-11 shrink-0 place-items-center rounded-full shadow-sm transition duration-200 hover:brightness-110 active:scale-95 disabled:bg-line disabled:bg-none disabled:text-muted disabled:shadow-none"
        >
          <SendIcon className="size-[18px] -translate-x-px" />
        </button>
      </form>

      <p id="composer-hint" className="sr-only">
        Entrée pour envoyer. Maj et Entrée pour aller à la ligne.
      </p>
    </div>
  );
}
