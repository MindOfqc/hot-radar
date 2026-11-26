import { memo, useCallback, useMemo, useRef, useState } from 'react';
import type { BoardId, WatchResult } from '../types';
import { BOARDS } from '../lib/boards';
import { scanKeyword, type ScanOutcome } from '../lib/aggregate';
import { analyzeBatch, analyzeItem } from '../lib/ai';
import { useLocalState, useSettings } from '../lib/storage';
import { Badge, Button, Card, EmptyState, SectionTitle, Spinner } from '../components/ui';
import { ResultCard } from '../components/result-card';
import { SearchIcon, SparkIcon } from '../components/icons';

type AnalyzedMap = Record<string, WatchResult>;

function sourceName(source: string): string {
  return BOARDS.find((board) => board.id === source)?.name ?? source;
}

/** 结果区独立成 memo 组件:搜索框每次按键不会重渲染整屏卡片 */
const ResultsPanel = memo(function ResultsPanel({
  outcome,
  searchedFor,
  sources,
  loading,
  analyzed,
  aiReady,
  aiBusy,
  aiDone,
  aiError,
  analyzingId,
  onAnalyze,
  onBatch,
}: {
  outcome: ScanOutcome;
  searchedFor: string;
  sources: BoardId[];
  loading: boolean;
  analyzed: AnalyzedMap;
  aiReady: boolean;
  aiBusy: boolean;
  aiDone: number;
  aiError: string;
  analyzingId: string | null;
  onAnalyze: (item: WatchResult) => void;
  onBatch: () => void;
}) {
  const [fText, setFText] = useState('');

  const results = useMemo(
    () =>
      outcome.results.map((item) => {
        const analysis = analyzed[item.id]?.ai;
        return analysis ? { ...item, ai: analysis } : item;
      }),
    [outcome, analyzed],
  );

  const filtered = useMemo(() => {
    const q = fText.trim().toLowerCase();
    if (!q) return results;
    return results.filter((item) =>
      `${item.title} ${item.ai?.summary ?? ''}`.toLowerCase().includes(q),
    );
  }, [results, fText]);

  const doneSources = outcome.sourceStats.length;
  const matchedSources = outcome.sourceStats.filter((s) => s.matched > 0);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] font-bold text-ink-soft">
          「{searchedFor}」共 <span className="font-mono font-black">{filtered.length}</span>
          {fText.trim() ? ` / ${results.length}` : ''} 条结果
          {loading && (
            <span className="font-mono text-[11px] text-muted">
              {' '}· 聚合中 {doneSources}/{sources.length}
            </span>
          )}
        </p>
        <input
          value={fText}
          onChange={(e) => setFText(e.target.value)}
          placeholder="过滤结果…"
          aria-label="过滤搜索结果"
          className="ml-auto h-8 w-28 rounded-btn border-[3px] border-ink bg-surface px-2.5 text-[12px] font-bold text-ink outline-none placeholder:font-medium placeholder:text-muted focus:shadow-toon-sm"
        />
        <Button
          size="sm"
          onClick={onBatch}
          disabled={!aiReady || aiBusy || loading || results.length === 0}
          title={aiReady ? '批量研判尚未分析的结果' : '请先在设置中配置 AI 密钥'}
        >
          {aiBusy ? <Spinner className="size-3.5" /> : <SparkIcon className="size-3.5" />}
          {aiBusy ? `AI 研判中 ${aiDone}` : 'AI 批量研判'}
        </Button>
      </div>

      {aiError && (
        <p className="text-xs font-bold text-danger" role="status">
          {aiError}
        </p>
      )}

      {loading && (
        <div className="flex flex-wrap gap-1.5" role="status" aria-live="polite">
          {sources.map((id) => {
            const b = BOARDS.find((board) => board.id === id)!;
            const stat = outcome.sourceStats.find((s) => s.source === id);
            return (
              <Badge key={id} tone={stat ? 'accent' : 'neutral'}>
                {stat ? `${b.name} ${stat.matched}` : `${b.name} …`}
              </Badge>
            );
          })}
        </div>
      )}

      {!loading && matchedSources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {matchedSources.map((s) => (
            <Badge key={s.source} tone="accent">
              {sourceName(s.source)} {s.matched}
            </Badge>
          ))}
        </div>
      )}

      <Card>
        {loading && results.length === 0 ? (
          <div className="p-6 text-center">
            <Spinner className="text-accent" />
            <p className="mt-2 text-sm font-bold text-muted">正在聚合各数据源…</p>
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            icon={<SearchIcon className="size-7" />}
            title="没有找到相关内容"
            desc="热榜更新有延迟,也可以换一个更宽泛的关键词"
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<SearchIcon className="size-7" />}
            title="没有符合过滤词的结果"
            desc="清空过滤词,或换一个更宽泛的关键词"
            action={
              <Button size="sm" onClick={() => setFText('')}>
                清空过滤
              </Button>
            }
          />
        ) : (
          filtered.map((item) => (
            <ResultCard
              key={item.id}
              item={item}
              onAnalyze={aiReady ? onAnalyze : undefined}
              analyzing={analyzingId === item.id}
            />
          ))
        )}
      </Card>
    </div>
  );
});

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [boards, setBoards] = useState<BoardId[]>(BOARDS.map((b) => b.id));
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [searchedFor, setSearchedFor] = useState('');

  const [settings] = useSettings();
  const [recent, setRecent] = useLocalState<string[]>('search:recent', []);
  const aiReady = Boolean(settings.openrouterKey);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiDone, setAiDone] = useState(0);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [aiError, setAiError] = useState('');
  const [analyzed, setAnalyzed] = useState<AnalyzedMap>({});
  const scanId = useRef(0);

  async function runSearch(term = query) {
    if (boards.length === 0) {
      setAiError('至少选择一个平台');
      return;
    }
    const q = term.trim();
    if (!q || loading) return;
    const scan = ++scanId.current;
    setQuery(q);
    setLoading(true);
    setOutcome({ results: [], sourceStats: [] });
    setSearchedFor(q);
    setAnalyzed({});
    setAiError('');
    try {
      const result = await scanKeyword(q, {
        boards,
        exclude: settings.globalExclude || undefined,
        onPartial: (partial) => {
          if (scanId.current === scan) setOutcome(partial);
        },
      });
      if (scanId.current === scan) setOutcome(result);
      setRecent((list) => [q, ...list.filter((item) => item !== q)].slice(0, 6));
    } catch (error) {
      if (scanId.current === scan) {
        setAiError(error instanceof Error ? error.message : '搜索失败,请稍后重试');
      }
    } finally {
      if (scanId.current === scan) setLoading(false);
    }
  }

  const runAi = useCallback(async () => {
    if (!outcome || !aiReady) return;
    const targets = outcome.results.filter((r) => !analyzed[r.id]?.ai).slice(0, 12);
    if (targets.length === 0) return;
    setAiBusy(true);
    setAiDone(0);
    setAiError('');
    try {
      const { failed } = await analyzeBatch(
        { apiKey: settings.openrouterKey, model: settings.model },
        searchedFor,
        targets,
        (item, analysis) => {
          if (analysis) {
            setAnalyzed((prev) => ({ ...prev, [item.id]: { ...item, ai: analysis } }));
          }
        },
        (p) => setAiDone(p.done),
      );
      if (failed > 0) setAiError(`${failed} 条研判失败,可稍后重试。`);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI 研判失败,请稍后重试');
    } finally {
      setAiBusy(false);
    }
  }, [outcome, aiReady, analyzed, settings.openrouterKey, settings.model, searchedFor]);

  const analyzeOne = useCallback(
    async (item: WatchResult) => {
      if (!aiReady) return;
      setAnalyzingId(item.id);
      setAiError('');
      try {
        const analysis = await analyzeItem(
          { apiKey: settings.openrouterKey, model: settings.model },
          searchedFor,
          item,
        );
        setAnalyzed((prev) => ({ ...prev, [item.id]: { ...item, ai: analysis } }));
      } catch (error) {
        setAiError(error instanceof Error ? error.message : '研判失败,请稍后重试');
      } finally {
        setAnalyzingId(null);
      }
    },
    [aiReady, settings.openrouterKey, settings.model, searchedFor],
  );

  function toggleBoard(id: BoardId) {
    setBoards((list) => (list.includes(id) ? list.filter((b) => b !== id) : [...list, id]));
  }

  return (
    <div className="mx-auto max-w-3xl animate-rise">
      <SectionTitle title="全网搜索" desc="一次性检索各平台热榜匹配与 HackerNews,不写入监控历史" />

      {/* 搜索框 */}
      <Card className="p-4 sm:p-5">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            placeholder="输入关键词,回车搜索"
            aria-label="搜索关键词"
            autoComplete="off"
            className="h-10 min-w-0 flex-1 rounded-btn border-[3px] border-ink bg-surface px-3.5 text-sm font-bold outline-none transition-all duration-100 placeholder:font-medium placeholder:text-muted focus:shadow-toon-sm"
            autoFocus
          />
          <Button
            variant="primary"
            onClick={() => runSearch()}
            disabled={loading || !query.trim() || boards.length === 0}
          >
            {loading ? <Spinner className="size-4" /> : <SearchIcon className="size-4" />}
            搜索
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {BOARDS.map((b) => {
            const on = boards.includes(b.id);
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => toggleBoard(b.id)}
                aria-pressed={on}
                className={`cursor-pointer rounded-full border-toon px-3 py-1 text-xs font-black transition-all duration-100 ${
                  on
                    ? '-rotate-1 bg-teal text-white shadow-toon-sm'
                    : 'bg-surface text-muted shadow-toon-sm hover:-rotate-1 hover:bg-yellow hover:text-ink active:translate-x-0.5 active:translate-y-0.5 active:shadow-toon-none'
                }`}
              >
                {b.name}
              </button>
            );
          })}
        </div>
        {recent.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-black text-muted">最近</span>
            {recent.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => void runSearch(item)}
                aria-label={`再次搜索 ${item}`}
                className="cursor-pointer rounded-full bg-paper px-2.5 py-1 text-[11px] font-bold text-ink-soft transition-colors hover:bg-yellow-soft hover:text-ink"
              >
                {item}
              </button>
            ))}
          </div>
        )}
        {boards.length === 0 && (
          <p className="mt-2 text-xs font-bold text-danger">至少选择一个平台</p>
        )}
      </Card>

      {/* 结果:数据源就绪即渲染,不等全部聚合完 */}
      {outcome && (
        <ResultsPanel
          outcome={outcome}
          searchedFor={searchedFor}
          sources={boards}
          loading={loading}
          analyzed={analyzed}
          aiReady={aiReady}
          aiBusy={aiBusy}
          aiDone={aiDone}
          aiError={aiError}
          analyzingId={analyzingId}
          onAnalyze={analyzeOne}
          onBatch={runAi}
        />
      )}

      {!outcome && !loading && aiError && (
        <p className="mt-3 text-xs font-bold text-danger" role="status">
          {aiError}
        </p>
      )}

      {!outcome && !loading && (
        <Card className="mt-4">
          <EmptyState
            icon={<SearchIcon className="size-7" />}
            title="搜一次,看全网"
            desc="各平台热榜关键词匹配 + HackerNews 全文检索,可按平台筛选"
          />
        </Card>
      )}
    </div>
  );
}
