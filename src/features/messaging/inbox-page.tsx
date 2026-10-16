import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Send, ArrowLeft } from "lucide-react";
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
  return (
    <section>
      <div className="section-heading">
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
            Back to booking
          </Button>
        )}
      </div>
      {started.error && <Problem error={started.error} />}
      <div className="inbox-layout">
        <aside className={active ? "thread-list has-active" : "thread-list"}>
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
                <button
                  key={t.id}
                  className="thread"
                  aria-current={t.id === active ? "true" : undefined}
                  onClick={() =>
                    navigate({
                      to: "/inbox",
                      search: { conversation: t.id, returnTo },
                    })
                  }
                >
                  <strong>{t.name}</strong>
                  <span>{t.packageTitle ?? "Private conversation"}</span>
                  <p>{t.preview ?? "Start a conversation"}</p>
                </button>
              ))}
            </nav>
          )}
        </aside>
        <div className="chat-panel">
          {!active ? (
            <NoResults
              title="A local connection starts here"
              description="Choose a conversation or find a host on an experience page."
            />
          ) : (
            <>
              <header className="chat-heading">
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
                <MessageScrollerProvider key={active}>
                  <MessageScroller className="chat-scroller">
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
                                            {new Intl.NumberFormat("en-US", {
                                              style: "currency",
                                              currency: m.package.currency,
                                            }).format(m.package.price)}
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
              <form className="chat-composer" onSubmit={submit}>
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
