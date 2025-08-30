// src/App.tsx

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import ReactFlow, {
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  Position,
} from "reactflow";
import type { Node, NodeChange, NodeProps, Edge, EdgeChange } from "reactflow";

import "reactflow/dist/style.css";
import { runOCR } from './ocr';

// Evil Clippy AI Component
interface BudgetData {
  sourceTotal: number;
  drainTotal: number;
  remaining: number;
  sourceNodes: Node[];
  drainNodes: Node[];
}

// Expense record interface
interface Expense {
  id: string;
  date: string; // ISO date (yyyy-mm-dd)
  description: string;
  amount: number; // positive value
  drainNodeId?: string; // category mapping (drain node)
  notes?: string; // optional AI extracted notes
  receiptText?: string; // raw OCR / AI extracted text
  merchant?: string;
  vatAmount?: number;
  currency?: string; // detected currency if foreign
  totalLineAmount?: number; // extracted grand total
  items?: LineItem[]; // extracted line items (optional)
}

// Individual receipt / invoice line item
interface LineItem {
  id: string;
  description: string;
  amount: number; // line total (incl VAT)
  quantity?: number;
  unitPrice?: number;
  drainNodeId?: string; // mapped category (drain) for this item
}

// Basic structured field extraction from Norwegian/English receipt text.
function extractStructuredFields(text: string): { merchant?: string; vatAmount?: number; total?: number; currency?: string } {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let merchant = lines[0]?.slice(0, 60);
  // Try to find a line with 'Org.nr' for merchant
  const orgIdx = lines.findIndex(l => /org\.? *nr/i.test(l));
  if (orgIdx > 0) merchant = lines[Math.max(0, orgIdx - 1)].slice(0, 60);
  // Currency detection (NOK by default)
  const currency = /\b(EUR|USD|GBP|SEK|DKK)\b/i.test(text) ? (text.match(/\b(EUR|USD|GBP|SEK|DKK)\b/i)?.[1].toUpperCase()) : 'NOK';
  // VAT (MVA) extraction: look for lines containing MVA or VAT with a number
  let vatAmount: number | undefined;
  const vatMatch = text.match(/(?:MVA|VAT)[^0-9]{0,10}([0-9]+[.,][0-9]{2})/i);
  if (vatMatch) {
    vatAmount = parseFloat(vatMatch[1].replace(/,/g, '.')) || undefined;
  }
  // Total extraction: pick the largest monetary number near keywords
  const moneyRegex = /(?:(?:Total|Sum|Å betale|Beløp)\D{0,15})?([0-9]{1,3}(?:[ .][0-9]{3})*[.,][0-9]{2})/gi;
  let max = 0;
  let match: RegExpExecArray | null;
  while ((match = moneyRegex.exec(text))) {
    const raw = match[1];
    const normalized = parseFloat(raw.replace(/[ .]/g, '').replace(',', '.'));
    if (!isNaN(normalized) && normalized > max && normalized < 1_000_000) {
      max = normalized;
    }
  }
  const total = max || undefined;
  return { merchant, vatAmount, total, currency };
}

interface AISession {
  prompt: (text: string) => Promise<string>;
  destroy: () => void;
}

interface AICreateOptions {
  systemPrompt?: string;
  temperature?: number;
  topK?: number; // added
}

interface AIWindow extends Window {
  ai: {
    languageModel: {
      capabilities: () => Promise<{ available: string }>;
      create: (options?: AICreateOptions) => Promise<AISession>;
    };
  };
}
// Currency formatter (Norwegian style with space thousands separator)
function formatNOK(value: string | number): string {
  const num = typeof value === 'number' ? value : parseFloat(value || '0');
  if (isNaN(num)) return '0,00';
  return num.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// EvilClippy component (clean version)
const EvilClippy = ({ budgetData, onRoast }: { budgetData: BudgetData; onRoast: (r: string) => void }) => {
  const [visible, setVisible] = useState(false);
  const [roast, setRoast] = useState('');
  const [status, setStatus] = useState<string>('');
  const [progress, setProgress] = useState<number | null>(null);
  const sessionRef = useRef<AISession | null>(null);
  const fallback = useRef(false);
  const attemptRef = useRef(0);
  const [needsUserGesture, setNeedsUserGesture] = useState(false); // added
  // Throttling + latest data refs
  const lastPromptAtRef = useRef(0);
  const lastSignatureRef = useRef<string | null>(null);
  const latestBudgetRef = useRef(budgetData);
  useEffect(() => { latestBudgetRef.current = budgetData; }, [budgetData]);

  // Minimum interval between AI prompts (ms)
  const AI_MIN_INTERVAL_MS = 60_000; // 1 minute
  const DEBOUNCE_MS = 1500; // wait for budget to settle
  const debounceTimerRef = useRef<number | null>(null);

  const computeSignature = useCallback((bd: BudgetData) => {
    // Signature only from financial-relevant info (ignore positions, ids for drag noise)
    const sources = bd.sourceNodes
      .map(n => `${n.data.label}:${n.data.amount}`)
      .sort()
      .join(',');
    const drains = bd.drainNodes
      .map(n => `${n.data.label}:${n.data.amount}:${n.data.drainType || ''}`)
      .sort()
      .join(',');
    return `${bd.sourceTotal}|${bd.drainTotal}|${bd.remaining}|S:${sources}|D:${drains}`;
  }, []);

  const FALLBACK_LINES = useMemo(() => [
    'Your budget is held together with optimism and duct tape. 📎',
    'Expenses are sprinting; income is power walking. 📎',
    'Savings hiding in witness protection again? 📎',
    'That remaining number looks fragile. 📎',
    'Cashflow turbulence: fasten seatbelts. 📎',
  ], []);

  const fallbackRoast = useCallback(() => {
    const line = FALLBACK_LINES[Math.floor(Math.random() * FALLBACK_LINES.length)];
    setRoast(line);
    onRoast(line);
  }, [onRoast, FALLBACK_LINES]);

  const attemptPrompt = useCallback(async (signature: string) => {
    const now = Date.now();
    if (signature === lastSignatureRef.current) return; // no change
    const enoughTime = (now - lastPromptAtRef.current) >= AI_MIN_INTERVAL_MS;
    if (!enoughTime) return; // respect minimum interval
    const bd = latestBudgetRef.current;
    if (sessionRef.current) {
      try {
        const { sourceTotal, drainTotal, remaining, sourceNodes, drainNodes } = bd;
        const prompt = `Give a witty, mild, concise (max 2 sentences) Norwegian-friendly budget quip ending with a paperclip emoji. Avoid harsh insults. Income sources: ${sourceNodes.length} total ${formatNOK(sourceTotal)}. Drains: ${drainNodes.length} total ${formatNOK(drainTotal)}. Remaining: ${formatNOK(remaining)} (${remaining < 0 ? 'negative' : remaining === 0 ? 'zero' : 'positive'}).`;
        const out = await sessionRef.current.prompt(prompt);
        setRoast(out);
        onRoast(out);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.debug('AI prompt failed, falling back', e);
        sessionRef.current = null;
        fallback.current = true;
        if (!/space|storage|disk/i.test(msg)) {
          setStatus('AI prompt failed – offline snark mode.');
        }
        fallbackRoast();
      }
    } else {
      fallbackRoast();
    }
    lastPromptAtRef.current = now;
    lastSignatureRef.current = signature;
  }, [onRoast, fallbackRoast]);

  // Debounce budget changes; ignore node drags (positions) because signature excludes them.
  useEffect(() => {
    const sig = computeSignature(budgetData);
    if (sig === lastSignatureRef.current) return; // nothing new
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => {
      attemptPrompt(sig);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [budgetData, attemptPrompt, computeSignature]);

  const tryInit = useCallback(async (fromUser: boolean) => { // param added
    attemptRef.current += 1;
    if (!fromUser) {
      // Should never be called silently now
      return;
    }
    setStatus('Initializing on‑device AI…');
    setProgress(null);
    fallback.current = false;
    sessionRef.current = null;
    setNeedsUserGesture(false);
    let created = false;

    const g = window as unknown as { LanguageModel?: { availability?: () => Promise<string>; create?: (opts?: Record<string, unknown>) => Promise<AISession> } };
    if (g.LanguageModel?.create) {
      try {
        const avail = await g.LanguageModel.availability?.();
        if (avail && avail !== 'unavailable') {
          if (avail === 'available' || fromUser) {
            const sess = await g.LanguageModel.create({
              temperature: 1.2,
              topK: 40,
              monitor: (m: { addEventListener?: (event: string, cb: (ev: { loaded?: number }) => void) => void }) =>
                m?.addEventListener?.('downloadprogress', (e: { loaded?: number }) => {
                  if (typeof e.loaded === 'number') {
                    setProgress(e.loaded);
                    setStatus(`Downloading model… ${(e.loaded * 100).toFixed(1)}%`);
                  }
                })
            });
            sessionRef.current = sess;
            created = true;
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/gesture/i.test(msg) || /NotAllowedError/i.test(msg)) {
          setNeedsUserGesture(true);
          setStatus('Click Enable AI to download the local model (~22 GB free).');
          return;
        }
        if (/space|storage|disk/i.test(msg)) {
          setStatus('Not enough disk space for AI model (~22 GB free needed). Using fallback.');
        } else {
          console.debug('Modern LanguageModel init failed', e);
        }
      }
    }

    if (!created) {
      const aiWindow = window as unknown as AIWindow & { ai?: { languageModel?: { create?: (opts?: Record<string, unknown>) => Promise<AISession>; capabilities?: () => Promise<{ available: string }> } } };
      if (aiWindow.ai?.languageModel?.create) {
        try {
          const caps = await aiWindow.ai.languageModel.capabilities();
          if (caps.available !== 'no') {
            const sess = await aiWindow.ai.languageModel.create({
              temperature: 1.2,
              topK: 40,
              monitor: (m: { addEventListener?: (event: string, cb: (ev: { loaded?: number }) => void) => void }) =>
                m?.addEventListener?.('downloadprogress', (e: { loaded?: number }) => {
                  if (typeof e.loaded === 'number') {
                    setProgress(e.loaded);
                    setStatus(`Downloading model… ${(e.loaded * 100).toFixed(1)}%`);
                  }
                })
            });
            sessionRef.current = sess;
            created = true;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/gesture/i.test(msg) || /NotAllowedError/i.test(msg)) {
            setNeedsUserGesture(true);
            setStatus('Click Enable AI to download the local model (~22 GB free).');
            return;
          }
          if (/space|storage|disk/i.test(msg)) {
            setStatus('Not enough disk space for AI model (~22 GB). Using fallback.');
          } else {
            console.debug('window.ai init failed', e);
          }
        }
      }
    }

    if (!created) {
      if (!needsUserGesture) {
        fallback.current = true;
        setStatus(prev => prev || 'On‑device model unavailable – offline snark mode.');
        fallbackRoast();
      }
    } else {
      setStatus('AI ready. Generating roasts.');
    }
    setVisible(true);
  }, [fallbackRoast, needsUserGesture]);

  useEffect(() => {
    // Passive availability check (no create call to avoid NotAllowedError)
    (async () => {
      setVisible(true);
      setStatus('Checking on‑device AI...');
      try {
        const g = window as unknown as { LanguageModel?: { availability?: () => Promise<string> } };
        const avail = await g?.LanguageModel?.availability?.();
        if (avail === 'available') {
          setNeedsUserGesture(true);
          setStatus('Enable AI to start local model.');
        } else if (avail === 'downloadable' || avail === 'downloading') {
          setNeedsUserGesture(true);
          setStatus('Enable AI to download local model (~22 GB free).');
        } else {
          setStatus('Local model not available – using fallback snark.');
          fallback.current = true;
          fallbackRoast();
        }
      } catch {
        setStatus('AI check failed – fallback mode.');
        fallback.current = true;
        fallbackRoast();
      }
    })();
    return () => {
      sessionRef.current?.destroy?.();
    };
  }, [fallbackRoast]);

  if (!visible) return null;
  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, background: '#2D3748', color: 'white', padding: '15px', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', maxWidth: 300, zIndex: 1000, fontSize: 14, border: '2px solid #E53E3E' }}>
      <div style={{ fontWeight: 'bold', marginBottom: 8, color: '#E53E3E' }}>🗂️ Evil Clippy Says:</div>
      {status && (
        <div style={{ fontSize: 12, color: '#CBD5E0', marginBottom: 6, lineHeight: 1.3 }}>
          {status}
          {progress !== null && progress < 1 && (
            <div style={{ marginTop: 4, background: '#4A5568', height: 6, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(progress * 100, 100)}%`, background: '#E53E3E', height: '100%', transition: 'width .3s' }} />
            </div>
          )}
          {!sessionRef.current && (needsUserGesture || fallback.current) && (
            <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
              {needsUserGesture && (
                <button
                  onClick={() => tryInit(true)}
                  style={{ background: '#E53E3E', color: 'white', border: 'none', padding: '4px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer' }}
                >
                  Enable AI
                </button>
              )}
              {fallback.current && !needsUserGesture && (
                <button
                  onClick={() => tryInit(true)}
                  style={{ background: '#E53E3E', color: 'white', border: 'none', padding: '4px 8px', fontSize: 11, borderRadius: 4, cursor: 'pointer' }}
                >
                  Retry AI
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <div style={{ lineHeight: 1.4 }}>{roast || 'Analyzing your budget... 📎'}</div>
      <button onClick={() => setVisible(false)} style={{ position: 'absolute', top: 5, right: 5, background: 'transparent', border: 'none', color: 'white', cursor: 'pointer', fontSize: 16 }} title="Hide Evil Clippy">×</button>
    </div>
  );
};

// Green Source node
const SourceNode = ({ data, id }: NodeProps) => {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [isEditingAmount, setIsEditingAmount] = useState(false);
  const [editLabel, setEditLabel] = useState(data.label || '');
  const [editAmount, setEditAmount] = useState(data.amount || '');

  const handleDelete = () => {
    window.dispatchEvent(new CustomEvent('deleteNode', { detail: { nodeId: id } }));
  };
  const handleLabelDoubleClick = () => { setIsEditingLabel(true); setEditLabel(data.label || ''); };
  const handleAmountDoubleClick = () => { setIsEditingAmount(true); setEditAmount(data.amount || ''); };

  const saveLabel = () => {
    if (editLabel.trim()) {
      window.dispatchEvent(new CustomEvent('updateNode', { detail: { nodeId: id, label: editLabel.trim(), amount: data.amount } }));
    }
    setIsEditingLabel(false);
  };
  const saveAmount = () => {
    if (editAmount && !isNaN(parseFloat(editAmount))) {
      window.dispatchEvent(new CustomEvent('updateNode', { detail: { nodeId: id, label: data.label, amount: editAmount } }));
    }
    setIsEditingAmount(false);
  };
  const handleLabelKeyPress = (e: React.KeyboardEvent) => { if (e.key === 'Enter') saveLabel(); else if (e.key === 'Escape') setIsEditingLabel(false); };
  const handleAmountKeyPress = (e: React.KeyboardEvent) => { if (e.key === 'Enter') saveAmount(); else if (e.key === 'Escape') setIsEditingAmount(false); };

  return (
    <div style={{ background: '#2D8A5F', color: 'white', padding: '10px 20px', borderRadius: 8, border: '2px solid #1E5E3F', width: 170, textAlign: 'center', position: 'relative' }}>
      <Handle type="source" position={Position.Bottom} />
      <button onClick={handleDelete} style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', fontSize: 12, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Delete node">×</button>
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
        {isEditingLabel ? (
          <input type="text" value={editLabel} onChange={e => setEditLabel(e.target.value)} onBlur={saveLabel} onKeyPress={handleLabelKeyPress} style={{ background: 'white', color: '#2D8A5F', border: '1px solid #1E5E3F', borderRadius: 3, padding: '2px 4px', fontSize: 14, fontWeight: 'bold', width: '100%', textAlign: 'center' }} autoFocus />
        ) : (
          <span onDoubleClick={handleLabelDoubleClick} style={{ cursor: 'pointer', userSelect: 'none' }} title="Double-click to edit label">{data.label}</span>
        )}
      </div>
      <div style={{ fontSize: '0.9em' }}>
        kr {isEditingAmount ? (
          <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} onBlur={saveAmount} onKeyPress={handleAmountKeyPress} style={{ background: 'white', color: '#2D8A5F', border: '1px solid #1E5E3F', borderRadius: 3, padding: '2px 4px', fontSize: 12, width: 80, textAlign: 'center' }} min="0" step="0.01" autoFocus />
        ) : (
          <span onDoubleClick={handleAmountDoubleClick} style={{ cursor: 'pointer', userSelect: 'none' }} title="Double-click to edit amount">{formatNOK(data.amount)}</span>
        )}
      </div>
    </div>
  );
};

// A red "Drain" node
const DrainNode = ({ data, id }: NodeProps) => {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [isEditingAmount, setIsEditingAmount] = useState(false);
  const [editLabel, setEditLabel] = useState(data.label || '');
  const [editAmount, setEditAmount] = useState(data.amount || '');

  const handleDelete = () => {
    window.dispatchEvent(new CustomEvent('deleteNode', { detail: { nodeId: id } }));
  };

  const handleLabelDoubleClick = () => {
    setIsEditingLabel(true);
    setEditLabel(data.label || '');
  };

  const handleAmountDoubleClick = () => {
    setIsEditingAmount(true);
    setEditAmount(data.amount || '');
  };

  const saveLabel = () => {
    if (editLabel.trim()) {
      window.dispatchEvent(new CustomEvent('updateNode', {
        detail: { nodeId: id, label: editLabel.trim(), amount: data.amount }
      }));
    }
    setIsEditingLabel(false);
  };

  const saveAmount = () => {
    if (editAmount && !isNaN(parseFloat(editAmount))) {
      window.dispatchEvent(new CustomEvent('updateNode', {
        detail: { nodeId: id, label: data.label, amount: editAmount }
      }));
    }
    setIsEditingAmount(false);
  };

  const handleLabelKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveLabel();
    } else if (e.key === 'Escape') {
      setIsEditingLabel(false);
    }
  };

  const handleAmountKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveAmount();
    } else if (e.key === 'Escape') {
      setIsEditingAmount(false);
    }
  };

  return (
    <div
      style={{
        background: "#B22222",
        color: "white",
        padding: "10px 20px",
        borderRadius: "8px",
        border: "2px solid #8B0000",
        width: 170,
        textAlign: "center",
        position: "relative",
      }}
    >
      <Handle type="target" position={Position.Top} />
      <button
        onClick={handleDelete}
        style={{
          position: "absolute",
          top: 5,
          right: 5,
          background: "rgba(255,255,255,0.2)",
          border: "none",
          borderRadius: "50%",
          width: 20,
          height: 20,
          cursor: "pointer",
          fontSize: "12px",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        title="Delete node"
      >
        ×
      </button>

      <div style={{ fontWeight: "bold", marginBottom: 4 }}>
        {isEditingLabel ? (
          <input
            type="text"
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            onBlur={saveLabel}
            onKeyPress={handleLabelKeyPress}
            style={{
              background: "white",
              color: "#B22222",
              border: "1px solid #8B0000",
              borderRadius: "3px",
              padding: "2px 4px",
              fontSize: "14px",
              fontWeight: "bold",
              width: "100%",
              textAlign: "center"
            }}
            autoFocus
          />
        ) : (
          <span
            onDoubleClick={handleLabelDoubleClick}
            style={{ cursor: "pointer", userSelect: "none" }}
            title="Double-click to edit label"
          >
            {data.label}
          </span>
        )}
      </div>

      <div style={{ fontSize: "0.9em" }}>
        {data.drainType === "percent" ? (
          isEditingAmount ? (
            <input
              type="number"
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
              onBlur={saveAmount}
              onKeyPress={handleAmountKeyPress}
              style={{
                background: "white",
                color: "#B22222",
                border: "1px solid #8B0000",
                borderRadius: "3px",
                padding: "2px 4px",
                fontSize: "12px",
                width: "60px",
                textAlign: "center"
              }}
              min="0"
              max="100"
              autoFocus
            />
          ) : (
            <span
              onDoubleClick={handleAmountDoubleClick}
              style={{ cursor: "pointer", userSelect: "none" }}
              title="Double-click to edit percent"
            >
              {data.amount}%
            </span>
          )
        ) : (
          <>
            kr {isEditingAmount ? (
              <input
                type="number"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                onBlur={saveAmount}
                onKeyPress={handleAmountKeyPress}
                style={{
                  background: "white",
                  color: "#B22222",
                  border: "1px solid #8B0000",
                  borderRadius: "3px",
                  padding: "2px 4px",
                  fontSize: "12px",
                  width: "80px",
                  textAlign: "center"
                }}
                min="0"
                step="0.01"
                autoFocus
              />
            ) : (
              <span
                onDoubleClick={handleAmountDoubleClick}
                style={{ cursor: "pointer", userSelect: "none" }}
                title="Double-click to edit amount"
              >
                {formatNOK(data.amount)}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// A blue "Total Sources" node
const TotalNode = ({ data }: NodeProps) => (
  <div
    style={{
      background: "#4A90E2",
      color: "white",
      padding: "15px 25px",
      borderRadius: "12px",
      border: "3px solid #2E5C8A",
      width: 200,
      textAlign: "center",
    }}
  >
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Bottom} />
    <div style={{ fontWeight: "bold", fontSize: "1.1em" }}>Total Sources</div>
    <div style={{ fontSize: "1.2em", marginTop: 8 }}>kr {formatNOK(data.total)}</div>
  </div>
);

// A purple "Remaining/Savings" node
const RemainingNode = ({ data }: NodeProps) => (
  <div
    style={{
      background: "#6B46C1",
      color: "white",
      padding: "15px 25px",
      borderRadius: "12px",
      border: "3px solid #553C9A",
      width: 200,
      textAlign: "center",
    }}
  >
    <Handle type="target" position={Position.Top} />
    <div style={{ fontWeight: "bold", fontSize: "1.1em" }}>Remaining</div>
    <div style={{ fontSize: "1.2em", marginTop: 8 }}>kr {formatNOK(data.amount)}</div>
  </div>
);

// Map node types to our custom components
const nodeTypes = {
  source: SourceNode,
  drain: DrainNode,
  total: TotalNode,
  remaining: RemainingNode,
};

const getId = (existingNodes: Node[]) => {
  // Find the highest existing node ID number and increment from there
  const existingIds = existingNodes
    .map(node => node.id)
    .filter(id => id.startsWith('node_'))
    .map(id => parseInt(id.replace('node_', '')))
    .filter(num => !isNaN(num));

  const maxId = existingIds.length > 0 ? Math.max(...existingIds) : -1;
  return `node_${maxId + 1}`;
};

// NOTE: We no longer rely on a snapshot of edges when creating new edge IDs.
// Instead we ensure uniqueness within the functional state updater when adding edges.
const generateEdgeId = (sourceId: string, targetId: string, existingEdges: Edge[]) => {
  const baseId = `edge-${sourceId}-${targetId}`;
  if (!existingEdges.some(e => e.id === baseId)) return baseId;
  // Append an incrementing suffix instead of timestamp for determinism.
  let i = 1;
  let candidate = `${baseId}-${i}`;
  while (existingEdges.some(e => e.id === candidate)) {
    i += 1;
    candidate = `${baseId}-${i}`;
  }
  return candidate;
};

function FlowCanvas() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [viewMode, setViewMode] = useState<'graph' | 'table' | 'expenses'>('graph'); // new toggle state
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourceAmount, setSourceAmount] = useState("");
  const [drainLabel, setDrainLabel] = useState("");
  const [drainAmount, setDrainAmount] = useState("");
  const [drainType, setDrainType] = useState<'amount' | 'percent'>('amount');
  const isLoadingRef = useRef(false);
  // Expenses state
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [timeGranularity, setTimeGranularity] = useState<'month' | 'week'>('month');
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [ocrLang, setOcrLang] = useState<'nor' | 'eng' | 'nor+eng'>('nor+eng');
  const [structuredParsing, setStructuredParsing] = useState(true);
  const [expandedExpenses, setExpandedExpenses] = useState<Record<string, boolean>>({});
  const [autoImporting, setAutoImporting] = useState(false);

  // Memoize nodeTypes to prevent recreation warnings
  const memoizedNodeTypes = useMemo(() => nodeTypes, []);

  // Load from localStorage on mount
  useEffect(() => {
    isLoadingRef.current = true;
    const savedNodes = localStorage.getItem("moneyflow-nodes");
    const savedEdges = localStorage.getItem("moneyflow-edges");
    const savedExpenses = localStorage.getItem('moneyflow-expenses');
    if (savedNodes) {
      try {
        const parsedNodes = JSON.parse(savedNodes);
        // Ensure total node exists
        const hasTotalNode = parsedNodes.some((n: Node) => n.id === 'total-node');
        if (!hasTotalNode) {
          parsedNodes.push({
            id: 'total-node',
            type: 'total',
            position: { x: 300, y: 200 }, // Center position for top-down flow
            data: { total: 0 },
          });
        }
        // Ensure remaining node exists
        const hasRemainingNode = parsedNodes.some((n: Node) => n.id === 'remaining-node');
        if (!hasRemainingNode) {
          parsedNodes.push({
            id: 'remaining-node',
            type: 'remaining',
            position: { x: 300, y: 350 }, // Below the total node
            data: { amount: 0 },
          });
        }
        setNodes(parsedNodes);
      } catch (e) {
        console.error("Failed to parse saved nodes:", e);
      }
    } else {
      // No saved data, create initial total and remaining nodes
      setNodes([{
        id: 'total-node',
        type: 'total',
        position: { x: 300, y: 200 }, // Center position for top-down flow
        data: { total: 0 },
      }, {
        id: 'remaining-node',
        type: 'remaining',
        position: { x: 300, y: 350 }, // Below the total node
        data: { amount: 0 },
      }]);
    }
    if (savedEdges) {
      try {
        let parsedEdges = JSON.parse(savedEdges);

        // Clean up and deduplicate edges to fix old data with duplicate IDs
        const seenIds = new Set<string>();
        parsedEdges = parsedEdges.filter((edge: Edge) => {
          if (seenIds.has(edge.id)) {
            return false; // Skip duplicate
          }
          seenIds.add(edge.id);
          return true;
        });

        if (savedExpenses) {
          try {
            const parsedExpenses: Expense[] = JSON.parse(savedExpenses);
            setExpenses(parsedExpenses);
          } catch (e) {
            console.error('Failed to parse saved expenses', e);
          }
        }
        // Ensure edge from total to remaining node exists
        const hasTotalToRemainingEdge = parsedEdges.some((edge: Edge) =>
          edge.source === 'total-node' && edge.target === 'remaining-node'
        );
        if (!hasTotalToRemainingEdge) {
          parsedEdges.push({
            id: 'total-to-remaining-edge',
            source: 'total-node',
            target: 'remaining-node',
            type: 'default',
          });
        }

        setEdges(parsedEdges);
      } catch (e) {
        console.error("Failed to parse saved edges:", e);
      }
    } else {
      // No saved edges, create the default total-to-remaining edge
      setEdges([{
        id: 'total-to-remaining-edge',
        source: 'total-node',
        target: 'remaining-node',
        type: 'default',
      }]);
    }
    // Small delay to ensure state is set before allowing saves
    setTimeout(() => {
      isLoadingRef.current = false;
    }, 100);
  }, []);

  // Save to localStorage on nodes/edges change (only if not loading)
  useEffect(() => {
    if (!isLoadingRef.current) {
      localStorage.setItem("moneyflow-nodes", JSON.stringify(nodes));
    }
  }, [nodes]);

  useEffect(() => {
    if (!isLoadingRef.current) {
      localStorage.setItem("moneyflow-edges", JSON.stringify(edges));
    }
  }, [edges]);
  useEffect(() => {
    if (!isLoadingRef.current) {
      localStorage.setItem('moneyflow-expenses', JSON.stringify(expenses));
    }
  }, [expenses]);

  // Calculate totals using useMemo to avoid infinite loops
  const sourceTotal = useMemo(() => {
    return nodes
      .filter((n) => n.type === 'source')
      .reduce((sum, n) => sum + (parseFloat(n.data.amount) || 0), 0);
  }, [nodes]);

  const drainAmounts = useMemo(() => {
    return nodes
      .filter((n) => n.type === 'drain' && (!n.data.drainType || n.data.drainType === 'amount'))
      .reduce((sum, n) => sum + (parseFloat(n.data.amount) || 0), 0);
  }, [nodes]);

  const drainPercents = useMemo(() => {
    return nodes
      .filter((n) => n.type === 'drain' && n.data.drainType === 'percent')
      .map((n) => ({ label: n.data.label, percent: parseFloat(n.data.amount) || 0, value: sourceTotal * (parseFloat(n.data.amount) || 0) / 100 }));
  }, [nodes, sourceTotal]);

  const drainPercentTotal = useMemo(() => {
    return drainPercents.reduce((sum, d) => sum + d.value, 0);
  }, [drainPercents]);

  const drainTotal = useMemo(() => {
    return drainAmounts + drainPercentTotal;
  }, [drainAmounts, drainPercentTotal]);

  const remaining = useMemo(() => {
    return sourceTotal - drainTotal;
  }, [sourceTotal, drainTotal]);

  // Update total and remaining node data when calculations change
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === 'total-node') {
          return { ...node, data: { ...node.data, total: sourceTotal } };
        }
        if (node.id === 'remaining-node') {
          return { ...node, data: { ...node.data, amount: remaining } };
        }
        return node;
      })
    );
  }, [sourceTotal, remaining]);

  const deleteNode = useCallback((nodeId: string) => {
    // Don't allow deleting the total or remaining nodes
    if (nodeId === 'total-node' || nodeId === 'remaining-node') {
      return;
    }

    // Find the node to get its label for the confirmation message
    const nodeToDelete = nodes.find(node => node.id === nodeId);
    const nodeLabel = nodeToDelete?.data?.label || 'this node';

    // Show confirmation dialog before deleting
    const confirmed = window.confirm(
      `Are you sure you want to delete "${nodeLabel}"?\n\nThis action cannot be undone.`
    );

    if (confirmed) {
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));
      setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    }
  }, [nodes]);

  // Handle node deletion
  useEffect(() => {
    const handleDeleteNode = (event: CustomEvent) => {
      const { nodeId } = event.detail;
      deleteNode(nodeId);
    };

    window.addEventListener('deleteNode', handleDeleteNode as EventListener);
    return () => {
      window.removeEventListener('deleteNode', handleDeleteNode as EventListener);
    };
  }, [deleteNode]);

  // Handle node amount adjustments
  useEffect(() => {
    const handleAdjustNode = (event: CustomEvent) => {
      const { nodeId, amount } = event.detail;
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, amount } }
            : node
        )
      );
    };

    window.addEventListener('adjustNode', handleAdjustNode as EventListener);
    return () => {
      window.removeEventListener('adjustNode', handleAdjustNode as EventListener);
    };
  }, []);

  // Handle node updates (label and amount changes)
  useEffect(() => {
    const handleUpdateNode = (event: CustomEvent) => {
      const { nodeId, label, amount } = event.detail;
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, label, amount } }
            : node
        )
      );
    };

    window.addEventListener('updateNode', handleUpdateNode as EventListener);
    return () => {
      window.removeEventListener('updateNode', handleUpdateNode as EventListener);
    };
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((nds) => {
        const updated = applyNodeChanges(changes, nds);
        return updated;
      }),
    [setNodes],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  const clearAllNodes = () => {
    // Show confirmation dialog before clearing
    const confirmed = window.confirm(
      "Are you sure you want to clear all sources and drains?\n\nThis action cannot be undone."
    );

    if (confirmed) {
      // Keep only the total and remaining nodes
      setNodes((nds) => nds.filter((node) => node.id === 'total-node' || node.id === 'remaining-node'));
      // Keep only the edge between total and remaining nodes
      setEdges((eds) => eds.filter((edge) => edge.id === 'total-to-remaining-edge'));
    }
  };

  const addNode = (
    type: "source" | "drain",
    label: string,
    amount: string,
    drainTypeArg?: 'amount' | 'percent'
  ) => {
    const nodeData =
      type === 'drain'
        ? { label, amount, drainType: drainTypeArg }
        : { label, amount };

    // Calculate position based on existing nodes
    const existingSources = nodes.filter(n => n.type === 'source');
    const existingDrains = nodes.filter(n => n.type === 'drain');

    let x, y;
    if (type === 'source') {
      x = 50 + (existingSources.length * 200); // Stack sources horizontally at top
      y = 50;
    } else {
      x = 50 + (existingDrains.length * 200); // Stack drains horizontally at bottom
      y = 400;
    }

    const newNode: Node = {
      id: getId(nodes),
      type,
      position: { x, y },
      data: nodeData,
    };

    setNodes((nds) => nds.concat(newNode));
    // Add edges with guaranteed unique IDs using functional updater so we see the latest edge list.
    setEdges(prev => {
      const next = [...prev];
      const maybeAddEdge = (source: string, target: string) => {
        // Skip if an identical source-target edge already exists (avoid logical duplicates).
        if (next.some(e => e.source === source && e.target === target)) return;
        const id = generateEdgeId(source, target, next);
        next.push({ id, source, target, type: 'default' });
      };
      if (type === 'source') {
        maybeAddEdge(newNode.id, 'total-node');
      } else if (type === 'drain') {
        maybeAddEdge('total-node', newNode.id);
      }
      return next;
    });
  };

  // Helper to update a node (label / amount / drainType) by id
  const mutateNode = useCallback((id: string, dataPatch: Record<string, unknown>) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, ...dataPatch } } : n));
  }, []);

  const sources = useMemo(() => nodes.filter(n => n.type === 'source'), [nodes]);
  const drains = useMemo(() => nodes.filter(n => n.type === 'drain'), [nodes]);

  const TableView = () => (
    <div style={{ maxWidth: '100%', overflowX: 'auto', marginTop: 12 }}>
      <h3 style={{ margin: '8px 0 4px' }}>Sources</h3>
      {sources.length === 0 ? <div style={{ fontSize: 13, color: '#555' }}>No sources yet.</div> : (
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f0f4f7' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', border: '1px solid #ddd' }}>Label</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', border: '1px solid #ddd' }}>Amount (kr)</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', border: '1px solid #ddd' }}>Yearly (kr)</th>
              <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sources.map(s => {
              const amt = parseFloat(s.data.amount) || 0;
              return (
                <tr key={s.id}>
                  <td style={{ padding: '4px 8px', border: '1px solid #eee' }}>
                    <input
                      value={s.data.label}
                      onChange={e => mutateNode(s.id, { label: e.target.value })}
                      style={{ width: '100%', padding: 4, fontSize: 13 }}
                    />
                  </td>
                  <td style={{ padding: '4px 8px', border: '1px solid #eee', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <input
                      type="number"
                      value={s.data.amount}
                      onChange={e => mutateNode(s.id, { amount: e.target.value })}
                      style={{ width: 90, padding: 4, fontSize: 13, textAlign: 'right' }}
                    />
                  </td>
                  <td style={{ padding: '4px 8px', border: '1px solid #eee', textAlign: 'right', whiteSpace: 'nowrap' }}>kr {formatNOK(amt * 12)}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #eee', textAlign: 'center' }}>
                    <button onClick={() => deleteNode(s.id)} style={{ background: '#dc3545', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <h3 style={{ margin: '16px 0 4px' }}>Drains</h3>
      {drains.length === 0 ? <div style={{ fontSize: 13, color: '#555' }}>No drains yet.</div> : (
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f9f1f0' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', border: '1px solid #ddd' }}>Label</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', border: '1px solid #ddd' }}>Type</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', border: '1px solid #ddd' }}>Value</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', border: '1px solid #ddd' }}>Computed (kr)</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', border: '1px solid #ddd' }}>Yearly (kr)</th>
              <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {drains.map(d => {
              const isPercent = d.data.drainType === 'percent';
              const raw = parseFloat(d.data.amount) || 0;
              const computed = isPercent ? sourceTotal * raw / 100 : raw;
              return (
                <tr key={d.id}>
                  <td style={{ padding: '4px 8px', border: '1px solid #eee' }}>
                    <input
                      value={d.data.label}
                      onChange={e => mutateNode(d.id, { label: e.target.value })}
                      style={{ width: '100%', padding: 4, fontSize: 13 }}
                    />
                  </td>
                  <td style={{ padding: '4px 8px', border: '1px solid #eee', textAlign: 'right' }}>
                    <select
                      value={isPercent ? 'percent' : 'amount'}
                      onChange={e => mutateNode(d.id, { drainType: e.target.value })}
                      style={{ padding: 4, fontSize: 13 }}
                    >
                      <option value="amount">kr</option>
                      <option value="percent">%</option>
                    </select>
                  </td>
                  <td style={{ padding: '4px 8px', border: '1px solid #eee', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <input
                      type="number"
                      value={d.data.amount}
                      onChange={e => mutateNode(d.id, { amount: e.target.value })}
                      style={{ width: isPercent ? 70 : 90, padding: 4, fontSize: 13, textAlign: 'right' }}
                      min={isPercent ? 0 : undefined}
                      max={isPercent ? 100 : undefined}
                    /> {isPercent ? '%' : ''}
                  </td>
                  <td style={{ padding: '4px 8px', border: '1px solid #eee', textAlign: 'right', whiteSpace: 'nowrap' }}>kr {formatNOK(computed)}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #eee', textAlign: 'right', whiteSpace: 'nowrap' }}>kr {formatNOK(computed * 12)}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #eee', textAlign: 'center' }}>
                    <button onClick={() => deleteNode(d.id)} style={{ background: '#dc3545', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: 16, fontSize: 14, fontWeight: 500 }}>Totals</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 4 }}>
        <div style={{ background: '#2D8A5F', color: '#fff', padding: '8px 12px', borderRadius: 6 }}>Sources: kr {formatNOK(sourceTotal)}</div>
        <div style={{ background: '#B22222', color: '#fff', padding: '8px 12px', borderRadius: 6 }}>Drains (Planned): kr {formatNOK(drainTotal)}</div>
        <div style={{ background: '#6B46C1', color: '#fff', padding: '8px 12px', borderRadius: 6 }}>Remaining (Planned): kr {formatNOK(remaining)}</div>
      </div>

      {/* Budget Export/Import Controls */}
      <div style={{ marginTop: 12, padding: '8px 12px', background: '#f8f9fa', borderRadius: 6, border: '1px solid #dee2e6' }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Budget Data</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => {
              const budgetData = {
                version: '1.0.0',
                exportDate: new Date().toISOString(),
                type: 'budget-only',
                data: {
                  nodes: nodes.filter(n => n.id !== 'total-node' && n.id !== 'remaining-node'),
                  edges: edges.filter(e => e.id !== 'total-to-remaining-edge')
                }
              };
              const dataStr = JSON.stringify(budgetData, null, 2);
              const dataBlob = new Blob([dataStr], { type: 'application/json' });
              const url = URL.createObjectURL(dataBlob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `money-flow-budget-${new Date().toISOString().slice(0, 10)}.json`;
              link.click();
              URL.revokeObjectURL(url);
            }}
            style={{ background: '#4A90E2', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
          >
            💰 Export Budget Only
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
          Export only sources & drains (no expenses) for budget template sharing
        </div>
      </div>
    </div>
  );

  // Period helpers
  const getISOWeek = (d: Date) => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  };

  const currentPeriodKey = useMemo(() => {
    const d = new Date();
    if (timeGranularity === 'month') return d.toISOString().slice(0, 7); // yyyy-mm
    return getISOWeek(d);
  }, [timeGranularity]);

  const expensePeriodKey = useCallback((isoDate: string) => {
    const d = new Date(isoDate + 'T00:00:00');
    if (timeGranularity === 'month') return isoDate.slice(0, 7);
    return getISOWeek(d);
  }, [timeGranularity]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => expensePeriodKey(e.date) === currentPeriodKey);
  }, [expenses, currentPeriodKey, expensePeriodKey]);

  // Actual spend per drain node (in current period)
  const actualSpendByDrain = useMemo(() => {
    const map: Record<string, number> = {};
    filteredExpenses.forEach(e => {
      if (e.drainNodeId) {
        map[e.drainNodeId] = (map[e.drainNodeId] || 0) + e.amount;
      }
    });
    return map;
  }, [filteredExpenses]);

  // Categorization heuristics + optional AI
  const keywordMap = useMemo(() => ([
    { kw: ['grocery', 'supermarket', 'coop', 'rema', 'kiwi', 'ica', 'spar'], label: 'Groceries' },
    { kw: ['electric', 'power', 'utility', 'strom', 'elvia'], label: 'Utilities' },
    { kw: ['water', 'rent', 'husleie'], label: 'Housing' },
    { kw: ['internet', 'fiber', 'broadband', 'wifi', 'telenor'], label: 'Internet' },
    { kw: ['mobile', 'phone', 'telia'], label: 'Mobile' },
    { kw: ['restaurant', 'dining', 'cafe', 'coffee', 'espresso'], label: 'Dining' },
    { kw: ['fuel', 'gas', 'diesel', 'bensin'], label: 'Transport' },
  ]), []);

  const findOrCreateDrainByLabel = useCallback((label: string) => {
    const existing = nodes.find(n => n.type === 'drain' && String(n.data.label).toLowerCase() === label.toLowerCase());
    if (existing) return existing.id;
    // Create a zero-amount drain node for tracking
    const newId = getId(nodes);
    const newNode: Node = {
      id: newId,
      type: 'drain',
      position: { x: 50 + (nodes.filter(n => n.type === 'drain').length * 200), y: 400 },
      data: { label, amount: '0', drainType: 'amount' }
    };
    setNodes(nds => nds.concat(newNode));
    setEdges(prev => {
      const next = [...prev];
      if (!next.some(e => e.source === 'total-node' && e.target === newId)) {
        next.push({ id: generateEdgeId('total-node', newId, next), source: 'total-node', target: newId, type: 'default' });
      }
      return next;
    });
    return newId;
  }, [nodes]);

  const categorizeExpense = useCallback(async (expense: Omit<Expense, 'drainNodeId'>): Promise<string | undefined> => {
    const text = (expense.receiptText || '') + ' ' + expense.description;
    const lower = text.toLowerCase();
    for (const entry of keywordMap) {
      if (entry.kw.some(k => lower.includes(k))) {
        return findOrCreateDrainByLabel(entry.label);
      }
    }
    // Attempt AI classification if available
    try {
      const g = window as unknown as { LanguageModel?: { availability?: () => Promise<string>; create?: (opts?: Record<string, unknown>) => Promise<AISession> } };
      let sess: AISession | null = null;
      if (g.LanguageModel?.create) {
        const avail = await g.LanguageModel.availability?.();
        if (avail && avail !== 'unavailable') {
          sess = await g.LanguageModel.create({ temperature: 0.2, topK: 10 });
        }
      }
      if (sess) {
        const prompt = `Classify the following Norwegian transaction description into a short budget category label (1-2 words). Only output the label. Description: "${expense.description}" Text: "${text.slice(0, 500)}"`;
        const out = await sess.prompt(prompt);
        const label = out.split(/\n|:|-/)[0].trim().slice(0, 40);
        if (label) return findOrCreateDrainByLabel(label);
      }
    } catch {
      // ignore AI failures
    }
    return undefined;
  }, [keywordMap, findOrCreateDrainByLabel]);

  // Heuristic line-item parsing from receipt text (Norwegian / English)
  const parseReceiptLineItems = useCallback((text: string): Omit<LineItem, 'id'>[] => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const items: Omit<LineItem, 'id'>[] = [];
    const skipRegex = /^(sum|total|mva|vat|beløp|å betale|change|subtotal|til gode)/i;
    // Pattern: description ... price (with , or . decimals)
    const priceAtEnd = /(.*?)([-]?\d{1,3}(?:[ .]\d{3})*[.,]\d{2})$/;
    for (const raw of lines) {
      if (raw.length < 3) continue;
      if (skipRegex.test(raw)) continue;
      const m = raw.match(priceAtEnd);
      if (!m) continue;
      const priceStr = m[2];
      const value = parseFloat(priceStr.replace(/[ .]/g, '').replace(',', '.'));
      if (!isFinite(value) || value <= 0 || value > 1_000_000) continue;
      let desc = m[1].trim().replace(/[-–]+$/, '').trim();
      if (!desc || /^(kr|nok)$/i.test(desc)) continue;
      // Attempt quantity x unit pattern inside description: e.g., "2x10,00" or "3 * 5,50"
      let quantity: number | undefined; let unitPrice: number | undefined;
      const qtyRegex = /(\d{1,3})\s*[xX*]\s*(\d{1,3}(?:[ .,]\d{3})*[.,]\d{2})/;
      const qtyMatch = desc.match(qtyRegex);
      if (qtyMatch) {
        quantity = parseFloat(qtyMatch[1]);
        unitPrice = parseFloat(qtyMatch[2].replace(/[ .]/g, '').replace(',', '.'));
        // Remove from desc
        desc = desc.replace(qtyRegex, '').trim();
        if (quantity && unitPrice && Math.abs((quantity * unitPrice) - value) / value > 0.25) {
          // If mismatch, discard quantity inference
          quantity = undefined; unitPrice = undefined;
        }
      }
      items.push({ description: desc.slice(0, 120), amount: value, quantity, unitPrice });
    }
    return items;
  }, []);

  const categorizeLineItem = useCallback((item: Omit<LineItem, 'id' | 'drainNodeId'>): string | undefined => {
    const lower = item.description.toLowerCase();
    for (const entry of keywordMap) {
      if (entry.kw.some(k => lower.includes(k))) {
        return findOrCreateDrainByLabel(entry.label);
      }
    }
    return undefined;
  }, [keywordMap, findOrCreateDrainByLabel]);

  // Auto add from file (no manual fields required)
  const addExpenseFromReceipt = useCallback(async (file: File) => {
    setAutoImporting(true);
    setIsCategorizing(true);
    let receiptText: string | undefined;
    const base: Omit<Expense, 'drainNodeId'> = {
      id: `exp_${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      description: 'Processing receipt…',
      amount: 0,
      notes: undefined,
      receiptText: undefined,
    };
    try {
      const isText = /text\/(plain|csv)/i.test(file.type) || /\.txt$/i.test(file.name);
      if (isText) {
        receiptText = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result.slice(0, 5000) : '');
          reader.onerror = () => resolve('');
          reader.readAsText(file);
        });
      } else {
        setOcrProgress(0);
        const { text } = await runOCR(file, p => setOcrProgress(p), { lang: ocrLang });
        receiptText = text.slice(0, 10000);
      }
      base.receiptText = receiptText;
      if (structuredParsing && receiptText) {
        const extracted = extractStructuredFields(receiptText);
        base.merchant = extracted.merchant;
        base.vatAmount = extracted.vatAmount ?? undefined;
        base.currency = extracted.currency;
        base.totalLineAmount = extracted.total ?? 0;
        if (extracted.total) base.amount = extracted.total;
        base.description = extracted.merchant || 'Receipt';
        const parsedItems = parseReceiptLineItems(receiptText);
        if (parsedItems.length) {
          const withCats = parsedItems.map((it, idx) => ({ ...it, id: `${base.id}_li_${idx}`, drainNodeId: categorizeLineItem(it) }));
          base.items = withCats;
          const sum = withCats.reduce((s, i) => s + i.amount, 0);
          if (!base.amount && sum > 0) base.amount = sum;
        }
      }
      // Fallback description if still placeholder
      if (!base.description || /processing receipt/i.test(base.description)) {
        base.description = base.merchant || file.name.replace(/\.[a-z0-9]+$/i, '');
      }
      const drainNodeId = await categorizeExpense(base);
      setExpenses(exps => exps.concat({ ...base, drainNodeId }));
    } catch (e) {
      console.warn('Auto import failed', e);
    } finally {
      setOcrProgress(null);
      setIsCategorizing(false);
      setAutoImporting(false);
      setReceiptFile(null);
    }
  }, [categorizeExpense, categorizeLineItem, ocrLang, parseReceiptLineItems, structuredParsing]);

  const handleAddExpense = useCallback(async () => {
    if (!expenseDesc || !expenseAmount) return;
    const base: Omit<Expense, 'drainNodeId'> = {
      id: `exp_${Date.now()}`,
      date: expenseDate,
      description: expenseDesc.trim(),
      amount: Math.abs(parseFloat(expenseAmount) || 0),
      notes: undefined,
      receiptText: undefined,
    };
    if (!base.amount) return;
    setIsCategorizing(true);
    let receiptText: string | undefined;
    if (receiptFile) {
      try {
        // Only attempt OCR for likely binary image/pdf (fallback to text read for .txt)
        const isText = /text\/(plain|csv)/i.test(receiptFile.type) || /\.txt$/i.test(receiptFile.name);
        if (isText) {
          receiptText = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result.slice(0, 5000) : '');
            reader.onerror = () => resolve('');
            reader.readAsText(receiptFile);
          });
        } else {
          setOcrProgress(0);
          const { text } = await runOCR(receiptFile, p => setOcrProgress(p), { lang: ocrLang });
          receiptText = text.slice(0, 10000);
        }
        base.receiptText = receiptText;
      } catch (err) {
        console.warn('OCR failed', err);
      } finally {
        setOcrProgress(null);
      }
    }
    // Structured extraction (client heuristic + optional AI fallback)
    if (structuredParsing && base.receiptText) {
      const extracted = extractStructuredFields(base.receiptText);
      base.merchant = extracted.merchant;
      base.vatAmount = extracted.vatAmount ?? undefined;
      base.currency = extracted.currency;
      base.totalLineAmount = extracted.total ?? base.amount;
      // If extracted total differs significantly (no overlap), adjust amount to total for consistency
      if (extracted.total && Math.abs(extracted.total - base.amount) / (extracted.total || 1) < 0.15) {
        // close enough; keep user entered amount
      } else if (extracted.total && extracted.total > 0 && base.amount === 0) {
        base.amount = extracted.total;
      }
      // Parse line items
      const parsedItems = parseReceiptLineItems(base.receiptText);
      if (parsedItems.length) {
        const withCats = parsedItems.map((it, idx) => ({ ...it, id: `${base.id}_li_${idx}`, drainNodeId: categorizeLineItem(it) }));
        base.items = withCats;
        // If user amount seems placeholder (e.g., 0) and items total > 0, sync amount to sum
        const itemsSum = withCats.reduce((s, i) => s + i.amount, 0);
        if (base.amount === 0 && itemsSum > 0) base.amount = itemsSum;
      }
    }
    const drainNodeId = await categorizeExpense(base);
    setExpenses(exps => exps.concat({ ...base, drainNodeId }));
    setExpenseDesc('');
    setExpenseAmount('');
    setReceiptFile(null);
    setIsCategorizing(false);
  }, [expenseDesc, expenseAmount, expenseDate, receiptFile, categorizeExpense, ocrLang, structuredParsing, parseReceiptLineItems, categorizeLineItem]);

  const totalActualThisPeriod = useMemo(() => filteredExpenses.reduce((s, e) => s + e.amount, 0), [filteredExpenses]);

  // Import/Export functionality
  const exportToJSON = useCallback(() => {
    const exportData = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      data: {
        nodes: nodes.filter(n => n.id !== 'total-node' && n.id !== 'remaining-node'), // Exclude system nodes
        edges: edges.filter(e => e.id !== 'total-to-remaining-edge'), // Exclude system edge
        expenses
      }
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `money-flow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, expenses]);

  const exportExpensesToCSV = useCallback(() => {
    const headers = [
      'Date', 'Description', 'Amount (kr)', 'Category', 'Merchant',
      'VAT Amount', 'Currency', 'Notes', 'Has Line Items'
    ];

    const csvRows = [headers.join(',')];

    expenses.forEach(expense => {
      const drainNode = expense.drainNodeId ? nodes.find(n => n.id === expense.drainNodeId) : undefined;
      const row = [
        expense.date,
        `"${expense.description.replace(/"/g, '""')}"`,
        expense.amount.toString(),
        drainNode ? `"${drainNode.data.label.replace(/"/g, '""')}"` : '',
        expense.merchant ? `"${expense.merchant.replace(/"/g, '""')}"` : '',
        expense.vatAmount?.toString() || '',
        expense.currency || '',
        expense.notes ? `"${expense.notes.replace(/"/g, '""')}"` : '',
        expense.items && expense.items.length > 0 ? 'Yes' : 'No'
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `money-flow-expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [expenses, nodes]);

  const importFromJSON = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importData = JSON.parse(content);

        // Validate import data structure
        if (!importData.data || !Array.isArray(importData.data.nodes) ||
          !Array.isArray(importData.data.edges) || !Array.isArray(importData.data.expenses)) {
          throw new Error('Invalid file format');
        }

        // Confirm import with user
        const confirmed = window.confirm(
          `Import data from ${importData.exportDate ? new Date(importData.exportDate).toLocaleDateString() : 'unknown date'}?\n\n` +
          `This will replace:\n` +
          `• ${importData.data.nodes.length} nodes\n` +
          `• ${importData.data.edges.length} edges\n` +
          `• ${importData.data.expenses.length} expenses\n\n` +
          `Current data will be backed up to localStorage first.`
        );

        if (!confirmed) return;

        // Backup current data
        const backup = {
          nodes: localStorage.getItem("moneyflow-nodes"),
          edges: localStorage.getItem("moneyflow-edges"),
          expenses: localStorage.getItem('moneyflow-expenses'),
          timestamp: new Date().toISOString()
        };
        localStorage.setItem('moneyflow-backup', JSON.stringify(backup));

        // Import new data
        const importedNodes = [...importData.data.nodes];
        const importedEdges = [...importData.data.edges];

        // Ensure system nodes exist
        const hasTotalNode = importedNodes.some(n => n.id === 'total-node');
        const hasRemainingNode = importedNodes.some(n => n.id === 'remaining-node');

        if (!hasTotalNode) {
          importedNodes.push({
            id: 'total-node',
            type: 'total',
            position: { x: 300, y: 200 },
            data: { total: 0 }
          });
        }

        if (!hasRemainingNode) {
          importedNodes.push({
            id: 'remaining-node',
            type: 'remaining',
            position: { x: 300, y: 350 },
            data: { amount: 0 }
          });
        }

        // Ensure system edge exists
        const hasSystemEdge = importedEdges.some(e =>
          e.source === 'total-node' && e.target === 'remaining-node'
        );

        if (!hasSystemEdge) {
          importedEdges.push({
            id: 'total-to-remaining-edge',
            source: 'total-node',
            target: 'remaining-node',
            type: 'default'
          });
        }

        setNodes(importedNodes);
        setEdges(importedEdges);
        setExpenses(importData.data.expenses);

        alert(`Successfully imported ${importData.data.nodes.length} nodes, ${importData.data.edges.length} edges, and ${importData.data.expenses.length} expenses.`);

      } catch (error) {
        console.error('Import failed:', error);
        alert(`Import failed: ${error instanceof Error ? error.message : 'Invalid file format'}`);
      }
    };
    reader.readAsText(file);
  }, []);

  const importExpensesFromCSV = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const lines = content.split('\n').filter(line => line.trim());

        if (lines.length < 2) {
          throw new Error('CSV file appears to be empty or invalid');
        }

        const headers = lines[0].split(',').map(h => h.trim().replace(/^"(.*)"$/, '$1'));
        const importedExpenses: Expense[] = [];

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim().replace(/^"(.*)"$/, '$1'));

          if (values.length < headers.length) continue; // Skip incomplete rows

          const expense: Expense = {
            id: `exp_${Date.now()}_${i}`,
            date: values[0] || new Date().toISOString().slice(0, 10),
            description: values[1] || 'Imported expense',
            amount: parseFloat(values[2]) || 0,
            merchant: values[4] || undefined,
            vatAmount: values[5] ? parseFloat(values[5]) : undefined,
            currency: values[6] || undefined,
            notes: values[7] || undefined
          };

          // Try to map category
          const categoryName = values[3];
          if (categoryName) {
            const matchingDrain = nodes.find(n =>
              n.type === 'drain' &&
              n.data.label.toLowerCase() === categoryName.toLowerCase()
            );
            if (matchingDrain) {
              expense.drainNodeId = matchingDrain.id;
            }
          }

          if (expense.amount > 0) {
            importedExpenses.push(expense);
          }
        }

        if (importedExpenses.length === 0) {
          throw new Error('No valid expenses found in CSV file');
        }

        const confirmed = window.confirm(
          `Import ${importedExpenses.length} expenses from CSV?\n\n` +
          `This will add to your existing expenses (not replace them).`
        );

        if (confirmed) {
          setExpenses(prev => [...prev, ...importedExpenses]);
          alert(`Successfully imported ${importedExpenses.length} expenses from CSV.`);
        }

      } catch (error) {
        console.error('CSV import failed:', error);
        alert(`CSV import failed: ${error instanceof Error ? error.message : 'Invalid file format'}`);
      }
    };
    reader.readAsText(file);
  }, [nodes]);

  const ExpenseView = () => (
    <div style={{ maxWidth: 900, marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Description</label>
          <input value={expenseDesc} onChange={e => setExpenseDesc(e.target.value)} placeholder="Grocery store" style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4, minWidth: 160 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Amount (kr)</label>
          <input type="number" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4, width: 110 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Date</label>
          <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Receipt (img/pdf)</label>
          <input
            type="file"
            accept="image/*,.pdf,.txt"
            onClick={e => { (e.target as HTMLInputElement).value = ''; }}
            onChange={e => {
              const f = e.target.files?.[0] || null;
              if (f) {
                console.debug('[receipt-file] selected', { name: f.name, type: f.type, size: f.size });
                // If no manual fields entered, auto import
                if (!expenseDesc && !expenseAmount) {
                  addExpenseFromReceipt(f);
                  return;
                }
              } else {
                console.debug('[receipt-file] selection cleared');
              }
              setReceiptFile(f);
            }}
            style={{ fontSize: 12 }}
          />
          {receiptFile && (
            <div style={{ fontSize: 11, marginTop: 2, color: '#333', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={receiptFile.name}>{receiptFile.name}</div>
          )}
          {autoImporting && <div style={{ fontSize: 11, marginTop: 4, color: '#1E5E3F' }}>Importing…</div>}
          {ocrProgress !== null && (
            <div style={{ marginTop: 4, fontSize: 11, color: '#555' }}>OCR: {(ocrProgress * 100).toFixed(0)}%</div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>OCR Lang</label>
          <select value={ocrLang} onChange={e => setOcrLang(e.target.value as 'nor' | 'eng' | 'nor+eng')} style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4 }}>
            <option value="nor+eng">nor+eng</option>
            <option value="nor">nor</option>
            <option value="eng">eng</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>Parse Structure</label>
          <label style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12, marginTop: 6 }}>
            <input type="checkbox" checked={structuredParsing} onChange={e => setStructuredParsing(e.target.checked)} /> enable
          </label>
        </div>
        <div>
          <button onClick={handleAddExpense} disabled={isCategorizing} style={{ marginTop: 18, background: '#1E5E3F', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>
            {isCategorizing ? 'Adding…' : '+ Add Expense'}
          </button>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12 }}>View:</label>
          <select value={timeGranularity} onChange={e => setTimeGranularity(e.target.value as 'month' | 'week')} style={{ padding: '6px 8px', border: '1px solid #ccc', borderRadius: 4 }}>
            <option value="month">Monthly</option>
            <option value="week">Weekly</option>
          </select>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{currentPeriodKey}</div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: '#444', marginBottom: 8 }}>Expenses in current {timeGranularity}: {filteredExpenses.length} | Total: kr {formatNOK(totalActualThisPeriod)}</div>

      {/* Import/Export Controls */}
      <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f8f9fa', borderRadius: 6, border: '1px solid #dee2e6' }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Import/Export</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={exportToJSON}
            style={{ background: '#2D8A5F', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
          >
            📦 Export All (JSON)
          </button>
          <button
            onClick={exportExpensesToCSV}
            style={{ background: '#4A90E2', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
          >
            📊 Export Expenses (CSV)
          </button>
          <input
            type="file"
            accept=".json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                importFromJSON(file);
                e.target.value = ''; // Clear input
              }
            }}
            style={{ display: 'none' }}
            id="import-json"
          />
          <label
            htmlFor="import-json"
            style={{ background: '#6B46C1', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12, display: 'inline-block' }}
          >
            📥 Import All (JSON)
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                importExpensesFromCSV(file);
                e.target.value = ''; // Clear input
              }
            }}
            style={{ display: 'none' }}
            id="import-csv"
          />
          <label
            htmlFor="import-csv"
            style={{ background: '#B22222', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12, display: 'inline-block' }}
          >
            📥 Import Expenses (CSV)
          </label>
        </div>
        <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
          JSON: Complete backup/restore • CSV: Expenses only for spreadsheet analysis
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f6f6f6' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', border: '1px solid #ddd' }}>Date</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', border: '1px solid #ddd' }}>Description</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', border: '1px solid #ddd' }}>Amount (kr)</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', border: '1px solid #ddd' }}>Category</th>
              <th style={{ padding: '6px 8px', border: '1px solid #ddd' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredExpenses.map(e => {
              const drainNode = e.drainNodeId ? nodes.find(n => n.id === e.drainNodeId) : undefined;
              return (
                <tr key={e.id}>
                  <td style={{ padding: '4px 8px', border: '1px solid #eee', whiteSpace: 'nowrap' }}>{e.date}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #eee' }} title={e.receiptText ? 'Click to view OCR text' : ''}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{e.description}</span>
                      {e.items && e.items.length > 0 && (
                        <button
                          onClick={() => setExpandedExpenses(prev => ({ ...prev, [e.id]: !prev[e.id] }))}
                          style={{ background: '#4A5568', color: '#fff', border: 'none', padding: '2px 6px', fontSize: 11, borderRadius: 4, cursor: 'pointer' }}
                          title="Toggle line items"
                        >{expandedExpenses[e.id] ? 'Hide' : 'Items'} ({e.items.length})</button>
                      )}
                    </div>
                    {e.merchant && <div style={{ fontSize: 11, color: '#555' }}>{e.merchant}</div>}
                    {e.vatAmount !== undefined && <div style={{ fontSize: 11, color: '#777' }}>MVA: {formatNOK(e.vatAmount)}</div>}
                  </td>
                  <td style={{ padding: '4px 8px', border: '1px solid #eee', textAlign: 'right' }}>kr {formatNOK(e.amount)}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #eee' }}>
                    <select
                      value={e.drainNodeId || ''}
                      onChange={ev => setExpenses(exps => exps.map(x => x.id === e.id ? { ...x, drainNodeId: ev.target.value || undefined } : x))}
                      style={{ padding: 4, fontSize: 13 }}
                    >
                      <option value="">(Unassigned)</option>
                      {nodes.filter(n => n.type === 'drain').map(d => (
                        <option key={d.id} value={d.id}>{d.data.label}</option>
                      ))}
                    </select>
                    {drainNode ? '' : e.drainNodeId ? ' (missing)' : ''}
                  </td>
                  <td style={{ padding: '4px 8px', border: '1px solid #eee', textAlign: 'center' }}>
                    <button onClick={() => setExpenses(exps => exps.filter(x => x.id !== e.id))} style={{ background: '#dc3545', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Delete</button>
                  </td>
                </tr>
              );
            })}
            {filteredExpenses.map(e => expandedExpenses[e.id] && e.items && e.items.length > 0 && (
              <tr key={e.id + '_items'}>
                <td colSpan={5} style={{ padding: 0, background: '#fafafa', border: '1px solid #ddd' }}>
                  <div style={{ padding: '8px 12px' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Line Items</div>
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f0f2f4' }}>
                          <th style={{ textAlign: 'left', padding: '4px 6px', border: '1px solid #ddd' }}>Description</th>
                          <th style={{ textAlign: 'right', padding: '4px 6px', border: '1px solid #ddd' }}>Qty</th>
                          <th style={{ textAlign: 'right', padding: '4px 6px', border: '1px solid #ddd' }}>Unit</th>
                          <th style={{ textAlign: 'right', padding: '4px 6px', border: '1px solid #ddd' }}>Amount</th>
                          <th style={{ textAlign: 'left', padding: '4px 6px', border: '1px solid #ddd' }}>Category</th>
                        </tr>
                      </thead>
                      <tbody>
                        {e.items.map(it => {
                          const dNode = it.drainNodeId ? nodes.find(n => n.id === it.drainNodeId) : undefined;
                          return (
                            <tr key={it.id}>
                              <td style={{ padding: '3px 6px', border: '1px solid #eee' }}>{it.description}</td>
                              <td style={{ padding: '3px 6px', border: '1px solid #eee', textAlign: 'right' }}>{it.quantity ?? ''}</td>
                              <td style={{ padding: '3px 6px', border: '1px solid #eee', textAlign: 'right' }}>{it.unitPrice ? formatNOK(it.unitPrice) : ''}</td>
                              <td style={{ padding: '3px 6px', border: '1px solid #eee', textAlign: 'right' }}>{formatNOK(it.amount)}</td>
                              <td style={{ padding: '3px 6px', border: '1px solid #eee' }}>
                                <select
                                  value={it.drainNodeId || ''}
                                  onChange={ev => setExpenses(exps => exps.map(x => x.id === e.id ? { ...x, items: x.items?.map(li => li.id === it.id ? { ...li, drainNodeId: ev.target.value || undefined } : li) } : x))}
                                  style={{ padding: 2, fontSize: 12 }}
                                >
                                  <option value="">(Unassigned)</option>
                                  {nodes.filter(n => n.type === 'drain').map(d => (
                                    <option key={d.id} value={d.id}>{d.data.label}</option>
                                  ))}
                                </select>
                                {dNode ? '' : it.drainNodeId ? ' (missing)' : ''}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#f0f2f4' }}>
                          <td colSpan={3} style={{ padding: '4px 6px', border: '1px solid #ddd', textAlign: 'right', fontWeight: 600 }}>Items Total</td>
                          <td style={{ padding: '4px 6px', border: '1px solid #ddd', textAlign: 'right', fontWeight: 600 }}>
                            {formatNOK(e.items.reduce((s, i) => s + i.amount, 0))}
                          </td>
                          <td style={{ border: '1px solid #ddd' }} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </td>
              </tr>
            ))}
            {filteredExpenses.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '12px 8px', textAlign: 'center', fontSize: 13, color: '#666' }}>No expenses yet in this period.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <h3 style={{ marginTop: 24, marginBottom: 8 }}>Planned vs Actual (Current {timeGranularity})</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#ece8f5' }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', border: '1px solid #ddd' }}>Category</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', border: '1px solid #ddd' }}>Planned (kr)</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', border: '1px solid #ddd' }}>Actual (kr)</th>
              <th style={{ textAlign: 'right', padding: '6px 8px', border: '1px solid #ddd' }}>Variance (kr)</th>
            </tr>
          </thead>
          <tbody>
            {nodes.filter(n => n.type === 'drain').map(d => {
              const planned = d.data.drainType === 'percent' ? (sourceTotal * (parseFloat(d.data.amount) || 0) / 100) : (parseFloat(d.data.amount) || 0);
              const actual = actualSpendByDrain[d.id] || 0;
              const variance = planned - actual; // positive means under budget
              return (
                <tr key={d.id}>
                  <td style={{ padding: '4px 8px', border: '1px solid #eee' }}>{d.data.label}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #eee', textAlign: 'right' }}>kr {formatNOK(planned)}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #eee', textAlign: 'right' }}>kr {formatNOK(actual)}</td>
                  <td style={{ padding: '4px 8px', border: '1px solid #eee', textAlign: 'right', color: variance >= 0 ? '#2D8A5F' : '#B22222' }}>kr {formatNOK(variance)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <div style={{ padding: "10px", position: "absolute", zIndex: 10, background: "rgba(255,255,255,0.95)", borderRadius: 8, minWidth: 350 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontWeight: 600 }}>Money Flow Builder</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setViewMode('graph')} disabled={viewMode === 'graph'} style={{ background: viewMode === 'graph' ? '#2D8A5F' : '#4A5568', opacity: viewMode === 'graph' ? 1 : 0.9, color: 'white', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: viewMode === 'graph' ? 'default' : 'pointer', fontSize: 12 }}>Graph</button>
            <button onClick={() => setViewMode('table')} disabled={viewMode === 'table'} style={{ background: viewMode === 'table' ? '#2D8A5F' : '#4A5568', opacity: viewMode === 'table' ? 1 : 0.9, color: 'white', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: viewMode === 'table' ? 'default' : 'pointer', fontSize: 12 }}>Planned Table</button>
            <button onClick={() => setViewMode('expenses')} disabled={viewMode === 'expenses'} style={{ background: viewMode === 'expenses' ? '#2D8A5F' : '#4A5568', opacity: viewMode === 'expenses' ? 1 : 0.9, color: 'white', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: viewMode === 'expenses' ? 'default' : 'pointer', fontSize: 12 }}>Expenses</button>
          </div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <input
            type="text"
            placeholder="Source label"
            value={sourceLabel}
            onChange={e => setSourceLabel(e.target.value)}
            style={{
              marginRight: 8,
              padding: '6px 8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              width: '120px'
            }}
          />
          <input
            type="number"
            placeholder="Amount (kr)"
            value={sourceAmount}
            onChange={e => setSourceAmount(e.target.value)}
            style={{
              marginRight: 8,
              padding: '6px 8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              width: '100px'
            }}
          />
          <button
            onClick={() => {
              if (sourceLabel && sourceAmount) {
                addNode("source", sourceLabel, sourceAmount);
                setSourceLabel("");
                setSourceAmount("");
              }
            }}
            style={{
              padding: '6px 12px',
              background: '#2D8A5F',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            + Add Source
          </button>
        </div>

        <div style={{ marginBottom: 8 }}>
          <input
            type="text"
            placeholder="Drain label"
            value={drainLabel}
            onChange={e => setDrainLabel(e.target.value)}
            style={{
              marginRight: 8,
              padding: '6px 8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              width: '120px'
            }}
          />
          <input
            type="number"
            placeholder={drainType === 'percent' ? 'Percent' : 'Amount (kr)'}
            value={drainAmount}
            onChange={e => setDrainAmount(e.target.value)}
            style={{
              marginRight: 8,
              padding: '6px 8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              width: '100px'
            }}
            min={drainType === 'percent' ? 0 : undefined}
            max={drainType === 'percent' ? 100 : undefined}
          />
          <select
            value={drainType}
            onChange={e => setDrainType(e.target.value as 'amount' | 'percent')}
            style={{
              marginRight: 8,
              padding: '6px 8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px'
            }}
          >
            <option value="amount">kr</option>
            <option value="percent">%</option>
          </select>
          <button
            onClick={() => {
              if (drainLabel && drainAmount) {
                addNode("drain", drainLabel, drainAmount, drainType);
                setDrainLabel("");
                setDrainAmount("");
              }
            }}
            style={{
              padding: '6px 12px',
              background: '#B22222',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            - Add Drain
          </button>
        </div>
        <div style={{ borderTop: '1px solid #ccc', paddingTop: 8, marginTop: 8 }}>
          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Overview</div>
          <div>Total Sources: <span style={{ fontWeight: 500 }}>kr {formatNOK(sourceTotal)}</span></div>
          <div style={{ fontSize: '0.85em', color: '#444', marginLeft: 8 }}>≈ Yearly Sources: kr {formatNOK(sourceTotal * 12)}</div>
          <div>Total Drains: <span style={{ fontWeight: 500 }}>kr {formatNOK(drainTotal)}</span></div>
          <div style={{ fontSize: '0.85em', color: '#444', marginLeft: 8 }}>≈ Yearly Drains: kr {formatNOK(drainTotal * 12)}</div>
          {drainPercents.length > 0 && (
            <div style={{ fontSize: '0.95em', marginLeft: 8 }}>
              {drainPercents.map((d, i) => (
                <div key={i}>{d.label}: {d.percent}% = kr {formatNOK(d.value)}</div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 4 }}>Remaining: <span style={{ fontWeight: 500 }}>kr {formatNOK(remaining)}</span></div>
          <div style={{ fontSize: '0.85em', color: '#444', marginLeft: 8 }}>≈ Yearly Remaining: kr {formatNOK(remaining * 12)}</div>
          <div style={{ marginTop: 8, borderTop: '1px solid #eee', paddingTop: 8 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
              <button
                onClick={exportToJSON}
                style={{
                  background: '#2D8A5F',
                  color: 'white',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: '0.9em',
                }}
                title="Export complete app data as JSON backup"
              >
                Export All
              </button>
              <input
                type="file"
                accept=".json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    importFromJSON(file);
                    e.target.value = ''; // Clear input
                  }
                }}
                style={{ display: 'none' }}
                id="import-json-main"
              />
              <label
                htmlFor="import-json-main"
                style={{
                  background: '#6B46C1',
                  color: 'white',
                  border: 'none',
                  padding: '4px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: '0.9em',
                  display: 'inline-block'
                }}
                title="Import complete app data from JSON backup"
              >
                Import All
              </label>
            </div>
            <button
              onClick={clearAllNodes}
              style={{
                background: '#dc3545',
                color: 'white',
                border: 'none',
                padding: '4px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: '0.9em',
              }}
              title="Clear all sources and drains"
            >
              Clear All
            </button>
          </div>
        </div>
        {viewMode === 'table' && <TableView />}
        {viewMode === 'expenses' && <ExpenseView />}
      </div>
      {viewMode === 'graph' && (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={memoizedNodeTypes}
          fitView
        >
          <Controls />
          <Background />
        </ReactFlow>
      )}

      {/* Evil Clippy AI Component */}
      <EvilClippy
        budgetData={{
          sourceTotal,
          drainTotal,
          remaining,
          sourceNodes: nodes.filter(n => n.type === 'source'),
          drainNodes: nodes.filter(n => n.type === 'drain')
        }}
        onRoast={() => { /* no-op consumer for now */ }}
      />
    </div>
  );
}

export default FlowCanvas;