import { getMessages } from "next-intl/server";

type Messages = Awaited<ReturnType<typeof getMessages>>;
type Namespace = keyof Messages;

/**
 * Sends only the namespaces Client Components need, instead of the whole
 * catalogue, to the browser.
 */
export async function getClientMessages(namespaces: readonly Namespace[]) {
  const messages = await getMessages();
  return Object.fromEntries(namespaces.map((ns) => [ns, messages[ns]])) as Partial<Messages>;
}
