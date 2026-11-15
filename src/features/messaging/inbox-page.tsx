import { useMoney } from "@/features/currency/currency-provider";
import { cn } from "@/lib/utils";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  useQuery,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Search } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Badge } from "@/components/ui/badge";
import { rpc } from "@/lib/supabase";
import { accountQuery } from "@/lib/queries";
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
import { sendChatMessage } from "./attachments";

type LoadResult = { index: number; startedAt: string; latencyMs: number; ok: boolean; error?: string };
function LoadDashboard({ conversationId }: { conversationId: string }) {
  const [count, setCount] = useState(100);
  const [concurrency, setConcurrency] = useState(5);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<LoadResult[]>([]);
  const cancelled = useRef(false);
  const run = async () => {
    cancelled.current = false; setResults([]); setRunning(true);
    const collected: LoadResult[] = []; let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, count) }, async () => {
      while (!cancelled.current) {
        const index = cursor++;
        if (index >= count) break;
        const started = Date.now(); const startedAt = new Date(started).toISOString();
        try {
          await sendChatMessage(conversationId, `[Load test ${startedAt}] Message ${index + 1}/${count}`, []);
          collected.push({ index: index + 1, startedAt, latencyMs: Date.now() - started, ok: true });
        } catch (error) {
          collected.push({ index: index + 1, startedAt, latencyMs: Date.now() - started, ok: false, error: error instanceof Error ? error.message : String(error) });
        }
        setResults([...collected].sort((a,b) => a.index - b.index));
      }
    });
    await Promise.all(workers); setRunning(false);
  };
  const exportCsv = () => {
    const rows = [["index","started_at","latency_ms","success","error"], ...results.map(r => [r.index, r.startedAt, r.latencyMs, r.ok, r.error ?? ""])];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(",")).join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = `messaging-load-${new Date().toISOString().replaceAll(":","-")}.csv`; link.click(); URL.revokeObjectURL(link.href);
  };
  const successful = results.filter(r => r.ok).length;
  return <section className="m-4 rounded-lg border p-4" aria-label="Messaging load test">
    <h2 className="text-lg font-semibold">Messaging load test</h2><p className="mb-3 text-sm text-muted-foreground">Sends real messages to this conversation as the signed-in user. Start with a small run.</p>
    <div className="flex flex-wrap items-end gap-3"><label className="text-sm">Messages<input className="mt-1 block w-28 rounded border bg-background px-2 py-1" type="number" min="1" max="1000" value={count} disabled={running} onChange={e=>setCount(Math.max(1,Math.min(1000,Number(e.target.value)||1)))}/></label><label className="text-sm">Concurrency<input className="mt-1 block w-28 rounded border bg-background px-2 py-1" type="number" min="1" max="20" value={concurrency} disabled={running} onChange={e=>setConcurrency(Math.max(1,Math.min(20,Number(e.target.value)||1)))}/></label><Button disabled={running} onClick={()=>void run()}>Start run</Button><Button variant="outline" disabled={!running} onClick={()=>{cancelled.current=true}}>Stop</Button><Button variant="outline" disabled={!results.length} onClick={exportCsv}>Export CSV</Button></div>
    <p className="mt-3 text-sm" aria-live="polite">{running ? `Running: ${results.length}/${count}` : `Completed: ${results.length} · ${successful} succeeded · ${results.length-successful} failed`}{results.length ? ` · average ${Math.round(results.reduce((sum,r)=>sum+r.latencyMs,0)/results.length)} ms` : ""}</p>
  </section>;
}
export function InboxPage({
  conversation,
  packageId,
  returnTo,
}: {
  conversation?: string;
  packageId?: string;
  returnTo?: string;
}) {
  const [search, setSearch] = useState("");
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
  const searchTerm = search.trim().toLocaleLowerCase();
  const filteredThreads = threads.data?.filter((thread) =>
    [thread.name, thread.packageTitle, thread.preview].some((value) =>
      value?.toLocaleLowerCase().includes(searchTerm),
    ),
  );
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
      {started.error && <Problem error={started.error} />}
      <div className="conversation-workspace grid min-h-[560px] overflow-hidden md:rounded-lg md:border md:bg-card md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)]">
        {active && (
          <div className="col-span-full">
            <LoadDashboard conversationId={active} />
          </div>
        )}
        <aside
          className={cn(
            "min-w-0 md:border-r md:bg-muted/25 md:py-5",
            active && "hidden md:block",
          )}
        >
          <div className="flex flex-col gap-4 pb-4 md:px-5">
            <h1 className="text-xl font-semibold md:text-base">
              Your conversations
            </h1>
            <InputGroup className="rounded-full bg-background">
              <InputGroupAddon>
                <Search aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                aria-label="Search conversations"
                placeholder="Search conversations"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </InputGroup>
          </div>
          {threads.isPending ? (
            <Loading />
          ) : threads.error ? (
            <Problem error={threads.error} />
          ) : !threads.data.length && !started.data ? (
            <NoResults
              title="Say hello"
              description="Open an experience and choose Chat with provider."
            />
          ) : !filteredThreads?.length ? (
            <NoResults
              title="No conversations found"
              description="Try another name, experience, or message."
            />
          ) : (
            <nav aria-label="Conversations">
              {filteredThreads.map((t, index) => (
                <div key={t.id}>
                  {index > 0 && <Separator />}
                  <Button
                    variant={t.id === active ? "secondary" : "ghost"}
                    className="h-auto w-full min-w-0 flex-col items-stretch gap-1 rounded-none px-0 py-4 text-left whitespace-normal md:px-5"
                    aria-current={t.id === active ? "true" : undefined}
                    onClick={() =>
                      navigate({
                        to: "/inbox",
                        search: { conversation: t.id, returnTo },
                      })
                    }
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <strong className="min-w-0 flex-1 truncate">
                        {t.name}
                      </strong>
                      {!!t.unread && <Badge>{t.unread} unread</Badge>}
                    </div>
                    <span className="truncate text-xs text-muted-foreground">
                      {t.packageTitle ?? "Private conversation"}
                    </span>
                    <p className="truncate text-sm text-muted-foreground">
                      {t.preview ?? "Start a conversation"}
                    </p>
                  </Button>
                </div>
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
