import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

/** The marketing channels leads can be credited to (set under Settings → Marketing). */
export const useChannels = () =>
  useQuery({ queryKey: ["marketing-channels"], queryFn: () => api<string[]>("/marketing/channels"), staleTime: 10 * 60_000 });

/**
 * A channel box that suggests the configured channels but lets you type a new one —
 * an offline activity that started last week shouldn't need a settings change first.
 */
export function ChannelInput({
  name,
  id,
  defaultValue,
  onCommit,
  placeholder = "Channel (e.g. Google Search Ads)",
  className = "field",
}: {
  name?: string;
  id: string;
  defaultValue?: string | null;
  onCommit?: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const channels = useChannels();
  return (
    <>
      <input
        name={name}
        list={id}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        maxLength={60}
        autoComplete="off"
        className={className}
        onBlur={onCommit ? (e) => onCommit(e.target.value.trim()) : undefined}
      />
      <datalist id={id}>
        {(channels.data ?? []).map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}
