import { useMoney } from "@/features/currency/currency-provider";
import { cn } from "@/lib/utils";
import { useState, useEffect, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Send, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { rpc } from "@/lib/supabase";
import { accountQuery } from "@/lib/queries";
import { safeReturn } from "@/lib/validation";
import type { Conversation, ChatMessage } from "./types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Message,
  MessageContent,
  MessageFooter,
} from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import {
  MessageScroller,
  MessageScrollerProvider,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from "@/components/ui/message-scroller";
import { Problem, Loading, NoResults } from "@/components/feedback";
export function InboxPage({
  conversation,
  packageId,
  returnTo,
}: {
  conversation?: string;
  packageId?: string;
  returnTo?: string;
}) {
  const money = useMoney();
  const [body, setBody] = useState("");
  const navigate = useNavigate();
  const client = useQueryClient();
  const account = useQuery(accountQuery());
  const started = useQuery({
    queryKey: ["start-chat", packageId],
    enabled: !!packageId,
    queryFn: () => rpc("start_chat", { package_id: packageId! }),
    staleTime: Infinity,
    retry: false,
  });
  const active = conversation ?? started.data;
  const threads = useQuery({
    queryKey: ["conversations"],
    queryFn: async () =>
      (await rpc("conversations", {})) as unknown as Conversation[],
    refetchInterval: 5000,
  });
  const messages = useQuery({
    queryKey: ["messages", active],
    enabled: !!active,
    queryFn: async () =>
      (await rpc("messages", {
        conversation_id: active!,
      })) as unknown as ChatMessage[],
    refetchInterval: 5000,
  });
  const send = useMutation({
    mutationFn: () =>
      rpc("send_message", { conversation_id: active!, body: body.trim() }),
    onSuccess: () => {
      setBody("");
      client.invalidateQueries({ queryKey: ["messages", active] });
      client.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (body.trim() && active) send.mutate();
  }
  const thread = threads.data?.find((t) => t.id === active);
  const lastMessage = messages.data?.at(-1)?.id;
  useEffect(() => {
    if (!active || !lastMessage) return;
    let visible = true;
    const markRead = () => {
      if (document.visibilityState !== "visible") return;
      void rpc("mark_conversation_read", {
        conversation_id: active,
        through_message_id: lastMessage,
      })
        .then(() => {
          if (visible) {
            void client.invalidateQueries({ queryKey: ["conversations"] });
            void client.invalidateQueries({ queryKey: ["provider-dashboard"] });
          }
        })
        .catch(() => {});
    };
    markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => {
      visible = false;
      document.removeEventListener("visibilitychange", markRead);
    };
  }, [active, lastMessage, client]);
  return (
    <section>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-5 [&_h1]:mb-3 [&_p]:text-muted-foreground">
        <div>
          <h1>A good trip starts with a hello.</h1>
          <p>Talk to your host before making it a plan.</p>
        </div>
        {returnTo && (
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={safeReturn(returnTo)} />}
          >
            {returnTo.startsWith("/account")
              ? "Back to dashboard"
              : "Back to booking"}
          </Button>
        )}
      </div>
      {started.error && <Problem error={started.error} />}
      <div className="grid min-h-[560px] overflow-hidden rounded-xl border bg-card md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside
          className={cn(
            "border-r py-5 [&>h2]:px-5 [&>h2]:pb-4 [&>h2]:text-base",
            active && "hidden md:block",
          )}
        >
          <h2>Your conversations</h2>
          {threads.isPending ? (
            <Loading />
          ) : threads.error ? (
            <Problem error={threads.error} />
          ) : !threads.data.length && !started.data ? (
            <NoResults
              title="Say hello"
              description="Open an experience and choose Chat with provider."
            />
          ) : (
            <nav aria-label="Conversations">
              {threads.data.map((t) => (
                <Button
                  key={t.id}
                  variant={t.id === active ? "secondary" : "ghost"}
                  className="h-auto w-full flex-col items-start gap-1 rounded-none px-5 py-4 text-left whitespace-normal [&_span]:text-xs [&_span]:text-muted-foreground [&_p]:max-w-full [&_p]:truncate [&_p]:text-sm"
                  aria-current={t.id === active ? "true" : undefined}
                  onClick={() =>
                    navigate({
                      to: "/inbox",
                      search: { conversation: t.id, returnTo },
                    })
                  }
                >
                  <strong>{t.name}</strong>
                  {!!t.unread && <Badge>{t.unread} unread</Badge>}
                  <span>{t.packageTitle ?? "Private conversation"}</span>
                  <p>{t.preview ?? "Start a conversation"}</p>
                </Button>
              ))}
            </nav>
          )}
        </aside>
        <div
          className={cn("flex min-w-0 flex-col", !active && "hidden md:flex")}
        >
          {!active ? (
            <NoResults
              title="A local connection starts here"
              description="Choose a conversation or find a host on an experience page."
            />
          ) : (
            <>
              <header className="flex items-center gap-3 border-b px-4 py-3 [&_h2]:text-base [&_p]:text-xs [&_p]:text-muted-foreground [&>a]:ml-auto [&>a]:text-xs [&>a]:font-semibold [&>a]:text-primary">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="All conversations"
                  onClick={() =>
                    navigate({ to: "/inbox", search: { returnTo } })
                  }
                >
                  <ArrowLeft />
                </Button>
                <div>
                  <h2>{thread?.name ?? "Your provider"}</h2>
                  <p>{thread?.packageTitle ?? "Private conversation"}</p>
                </div>
                {thread?.packageId && (
                  <Link
                    to="/experience/$id"
                    params={{ id: thread.packageId }}
                    search={{}}
                  >
                    View experience
                  </Link>
                )}
              </header>
              {messages.isPending ? (
                <Loading />
              ) : messages.error ? (
                <Problem error={messages.error} />
              ) : (
                <MessageScrollerProvider
                  key={active}
                  autoScroll
                  defaultScrollPosition="end"
                >
                  <MessageScroller className="h-[400px] min-h-[300px] max-h-[55vh] flex-1">
                    <MessageScrollerViewport>
                      <MessageScrollerContent className="p-5">
                        {messages.data.length === 0 ? (
                          <NoResults
                            title="Meet your host"
                            description="Ask about the experience, meeting point, or what to bring."
                          />
                        ) : (
                          messages.data.map((m) => (
                            <MessageScrollerItem key={m.id}>
                              <Message
                                align={
                                  m.senderId === account.data?.id
                                    ? "end"
                                    : "start"
                                }
                              >
                                <MessageContent>
                                  <Bubble
                                    variant={
                                      m.senderId === account.data?.id
                                        ? "default"
                                        : "muted"
                                    }
                                  >
                                    <BubbleContent>
                                      <p className="whitespace-pre-wrap">
                                        {m.body}
                                      </p>
                                      {m.package && (
                                        <div className="mt-3 flex flex-col gap-2">
                                          <strong>{m.package.title}</strong>
                                          <p>
                                            {money(
                                              m.package.price,
                                              m.package.currency,
                                            )}
                                          </p>
                                          <p>{m.package.description}</p>
                                        </div>
                                      )}
                                    </BubbleContent>
                                  </Bubble>
                                  <MessageFooter>
                                    {new Date(m.createdAt).toLocaleString()}
                                  </MessageFooter>
                                </MessageContent>
                              </Message>
                            </MessageScrollerItem>
                          ))
                        )}
                      </MessageScrollerContent>
                    </MessageScrollerViewport>
                    <MessageScrollerButton />
                  </MessageScroller>
                </MessageScrollerProvider>
              )}
              {send.error && <Problem error={send.error} />}
              <form
                className="flex items-end gap-3 border-t p-4 [&>div]:flex-1 [&_textarea]:min-h-14"
                onSubmit={submit}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel className="sr-only" htmlFor="message">
                      Your message
                    </FieldLabel>
                    <Textarea
                      id="message"
                      placeholder="Ask your host a question…"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      maxLength={1000}
                      required
                    />
                  </Field>
                </FieldGroup>
                <Button type="submit" disabled={send.isPending || !body.trim()}>
                  <Send data-icon="inline-start" />
                  {send.isPending ? "Sending…" : "Send"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
