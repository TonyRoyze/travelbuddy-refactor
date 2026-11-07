import { useMoney } from "@/features/currency/currency-provider";
import { cn } from "@/lib/utils";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  useQuery,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { rpc } from "@/lib/supabase";
import { accountQuery } from "@/lib/queries";
import { useMessageUpdates } from "./realtime";
import type { Conversation, ChatMessage } from "./types";
import { Button, buttonVariants } from "@/components/ui/button";
import { MessageComposer } from "./message-composer";
import { MessageAttachment } from "./message-attachment";
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
import { Problem, Loading, NoResults } from "@/components/custom-ui/feedback";
export function InboxPage({
  conversation,
  packageId,
  returnTo,
}: {
  conversation?: string;
  packageId?: string;
  returnTo?: string;
}) {
  useMessageUpdates();
  const money = useMoney();
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
  const scrollRestore = useRef<{ height: number; top: number } | null>(null);
  type MessageCursor = { createdAt: string; id: string };
  type MessagePage = {
    items: ChatMessage[];
    hasMore: boolean;
    nextBefore: MessageCursor | null;
  };
  const threads = useQuery({
    queryKey: ["conversations"],
    queryFn: async () =>
      (await rpc("conversations", {})) as unknown as Conversation[],
  });
  const messages = useInfiniteQuery({
    queryKey: ["messages", active],
    enabled: !!active,
    initialPageParam: null as MessageCursor | null,
    queryFn: async ({ pageParam }): Promise<MessagePage> =>
      (await rpc("message_page", {
        conversation_id: active!,
        before_created_at: pageParam?.createdAt ?? null,
        before_id: pageParam?.id ?? null,
      })) as unknown as MessagePage,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? (lastPage.nextBefore ?? undefined) : undefined,
  });
  const thread = threads.data?.find((t) => t.id === active);
  const lastMessage = messages.data?.pages[0]?.items.at(-1)?.id;
  const pageCount = messages.data?.pages.length ?? 0;
  const seenMessageIds = new Set<string>();
  const visibleMessages = messages.data?.pages
    .slice()
    .reverse()
    .flatMap((page) => page.items)
    .filter((message) => {
      if (seenMessageIds.has(message.id)) return false;
      seenMessageIds.add(message.id);
      return true;
    });
  useLayoutEffect(() => {
    const previous = scrollRestore.current;
    if (!previous) return;
    const viewport = document.querySelector<HTMLElement>(
      '[data-slot="message-scroller-viewport"]',
    );
    if (viewport) {
      viewport.scrollTop =
        previous.top + viewport.scrollHeight - previous.height;
    }
    scrollRestore.current = null;
  }, [pageCount]);
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
      </div>
      {started.error && <Problem error={started.error} />}
      <div className="conversation-workspace grid min-h-[560px] overflow-hidden rounded-lg border bg-card md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside
          className={cn(
            "border-r bg-muted/25 py-5 [&>h2]:px-5 [&>h2]:pb-4 [&>h2]:text-base",
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
                    aria-label="View experience"
                    title="View experience"
                    className={buttonVariants({
                      variant: "ghost",
                      size: "icon",
                    })}
                  >
                    <ExternalLink aria-hidden="true" />
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
                    {messages.hasNextPage && (
                      <div className="border-b p-3 text-center">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={messages.isFetchingNextPage}
                          onClick={() => {
                            const viewport =
                              document.querySelector<HTMLElement>(
                                '[data-slot="message-scroller-viewport"]',
                              );
                            if (viewport) {
                              scrollRestore.current = {
                                height: viewport.scrollHeight,
                                top: viewport.scrollTop,
                              };
                            }
                            void messages.fetchNextPage();
                          }}
                        >
                          {messages.isFetchingNextPage
                            ? "Loading older messages…"
                            : "Load older messages"}
                        </Button>
                      </div>
                    )}
                    <MessageScrollerViewport>
                      <MessageScrollerContent className="p-5">
                        {!visibleMessages?.length ? (
                          <NoResults
                            title="Meet your host"
                            description="Ask about the experience, meeting point, or what to bring."
                          />
                        ) : (
                          visibleMessages?.map((m) => (
                            <MessageScrollerItem key={m.id} messageId={m.id}>
                              <Message
                                align={
                                  m.senderId === account.data?.id
                                    ? "end"
                                    : "start"
                                }
                              >
                                <MessageContent>
                                  <Bubble
                                    align={
                                      m.senderId === account.data?.id
                                        ? "end"
                                        : "start"
                                    }
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
                                          {m.package.id ? (
                                            <Link
                                              to="/experience/$id"
                                              params={{ id: m.package.id }}
                                              search={{}}
                                              className="inline-flex items-center gap-2 font-semibold"
                                            >
                                              {m.package.title}
                                              <ExternalLink
                                                className="size-4"
                                                aria-hidden="true"
                                              />
                                            </Link>
                                          ) : (
                                            <strong>{m.package.title}</strong>
                                          )}
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
                                  {!!m.attachments?.length && (
                                    <div className="flex max-w-full flex-wrap gap-2">
                                      {m.attachments.map((file) => (
                                        <MessageAttachment
                                          key={file.path}
                                          file={file}
                                        />
                                      ))}
                                    </div>
                                  )}
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
              <MessageComposer
                key={active}
                conversationId={active}
                buddy={
                  !!account.data?.roles.some(
                    (role) => role === "provider" || role === "guide",
                  )
                }
              />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
