import React, { useState, useRef, useEffect } from 'react';
import {
  Scissors,
  CaseSensitive,
  Sparkles,
  Search,
  Trash2,
  Edit3,
  ArrowRight,
  Database,
  Check,
  ChevronRight,
  X,
} from 'lucide-react';

interface WranglerContextMenuProps {
  column: string;
  columnType: string;
  position: { x: number; y: number };
  onClose: () => void;
  onApplyAction: (action: string, column: string, params?: Record<string, any>) => void;
}

export const WranglerContextMenu: React.FC<WranglerContextMenuProps> = ({
  column,
  columnType,
  position,
  onClose,
  onApplyAction,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);

  // Dialog states for parameterized actions
  const [showSplitModal, setShowSplitModal] = useState<boolean>(false);
  const [splitDelimiter, setSplitDelimiter] = useState<string>(' ');
  const [splitCol1, setSplitCol1] = useState<string>(`${column}_1`);
  const [splitCol2, setSplitCol2] = useState<string>(`${column}_2`);
  const [dropOriginal, setDropOriginal] = useState<boolean>(false);

  const [showNullModal, setShowNullModal] = useState<boolean>(false);
  const [nullDefaultValue, setNullDefaultValue] = useState<string>('N/A');

  const [showRenameModal, setShowRenameModal] = useState<boolean>(false);
  const [renameValue, setRenameValue] = useState<string>(column);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [onClose]);

  // Adjust menu position if near edge of screen
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(position.y, window.innerHeight - 380),
    left: Math.min(position.x, window.innerWidth - 260),
    zIndex: 9999,
  };

  const isNumeric = ['int', 'integer', 'bigint', 'double', 'float', 'decimal'].some((t) =>
    columnType.toLowerCase().includes(t)
  );

  return (
    <>
      <div
        ref={menuRef}
        style={menuStyle}
        className="w-64 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl shadow-2xl py-1.5 text-xs text-[var(--text-primary)] select-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Menu Header */}
        <div className="px-3.5 py-2 border-b border-[var(--border-hairline)] flex items-center justify-between bg-[var(--bg-subtle)]">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="font-semibold truncate max-w-[150px] font-mono text-[var(--text-primary)]">
              {column}
            </span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-hairline)] text-[var(--text-muted)]">
              {columnType}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Action List */}
        <div className="py-1">
          {/* Split Delimiter */}
          <button
            type="button"
            onClick={() => setShowSplitModal(true)}
            className="w-full px-3.5 py-2 text-left flex items-center justify-between hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Scissors className="w-3.5 h-3.5 text-[#FF4B3E]" />
              <span>Split by Delimiter...</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </button>

          {/* Text Casing */}
          <div
            className="relative"
            onMouseEnter={() => setActiveSubmenu('casing')}
            onMouseLeave={() => setActiveSubmenu(null)}
          >
            <button
              type="button"
              className="w-full px-3.5 py-2 text-left flex items-center justify-between hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <CaseSensitive className="w-3.5 h-3.5 text-[#FF4B3E]" />
                <span>Change Casing</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            </button>

            {activeSubmenu === 'casing' && (
              <div className="absolute left-full top-0 ml-1 w-48 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl shadow-xl py-1 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    onApplyAction('change_casing', column, { case: 'upper' });
                    onClose();
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-[var(--bg-hover)] transition-colors cursor-pointer block"
                >
                  UPPERCASE
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApplyAction('change_casing', column, { case: 'lower' });
                    onClose();
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-[var(--bg-hover)] transition-colors cursor-pointer block"
                >
                  lowercase
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApplyAction('change_casing', column, { case: 'title' });
                    onClose();
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-[var(--bg-hover)] transition-colors cursor-pointer block"
                >
                  Title Case
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApplyAction('trim_whitespace', column);
                    onClose();
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-[var(--bg-hover)] transition-colors cursor-pointer block border-t border-[var(--border-hairline)] mt-1 pt-1.5"
                >
                  Trim Whitespace
                </button>
              </div>
            )}
          </div>

          {/* Imputation */}
          <div
            className="relative"
            onMouseEnter={() => setActiveSubmenu('impute')}
            onMouseLeave={() => setActiveSubmenu(null)}
          >
            <button
              type="button"
              className="w-full px-3.5 py-2 text-left flex items-center justify-between hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-3.5 h-3.5 text-[#FF4B3E]" />
                <span>Impute Missing Values</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            </button>

            {activeSubmenu === 'impute' && (
              <div className="absolute left-full top-0 ml-1 w-52 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl shadow-xl py-1 text-xs">
                {isNumeric && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onApplyAction('impute_missing', column, { strategy: 'mean' });
                        onClose();
                      }}
                      className="w-full px-3 py-1.5 text-left hover:bg-[var(--bg-hover)] transition-colors cursor-pointer block"
                    >
                      Fill with Mean (Average)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onApplyAction('impute_missing', column, { strategy: 'median' });
                        onClose();
                      }}
                      className="w-full px-3 py-1.5 text-left hover:bg-[var(--bg-hover)] transition-colors cursor-pointer block"
                    >
                      Fill with Median (50th %)
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onApplyAction('impute_missing', column, { strategy: 'mode' });
                    onClose();
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-[var(--bg-hover)] transition-colors cursor-pointer block"
                >
                  Fill with Mode (Most Frequent)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApplyAction('impute_missing', column, { strategy: 'forward_fill' });
                    onClose();
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-[var(--bg-hover)] transition-colors cursor-pointer block"
                >
                  Forward Fill (LOCF)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApplyAction('impute_missing', column, { strategy: 'backward_fill' });
                    onClose();
                  }}
                  className="w-full px-3 py-1.5 text-left hover:bg-[var(--bg-hover)] transition-colors cursor-pointer block"
                >
                  Backward Fill (NOCB)
                </button>
              </div>
            )}
          </div>

          {/* Replace NULLs with Default */}
          <button
            type="button"
            onClick={() => setShowNullModal(true)}
            className="w-full px-3.5 py-2 text-left flex items-center justify-between hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <Search className="w-3.5 h-3.5 text-[#FF4B3E]" />
              <span>Replace NULLs with Constant...</span>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </button>

          <div className="my-1 border-t border-[var(--border-hairline)]" />

          {/* Cast Type */}
          <div
            className="relative"
            onMouseEnter={() => setActiveSubmenu('cast')}
            onMouseLeave={() => setActiveSubmenu(null)}
          >
            <button
              type="button"
              className="w-full px-3.5 py-2 text-left flex items-center justify-between hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Database className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span>Cast Data Type</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            </button>

            {activeSubmenu === 'cast' && (
              <div className="absolute left-full top-0 ml-1 w-40 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl shadow-xl py-1 text-xs">
                {['VARCHAR', 'BIGINT', 'DOUBLE', 'BOOLEAN', 'DATE', 'TIMESTAMP'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      onApplyAction('cast_type', column, { target_type: t });
                      onClose();
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-[var(--bg-hover)] transition-colors cursor-pointer block font-mono text-[11px]"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Rename Column */}
          <button
            type="button"
            onClick={() => setShowRenameModal(true)}
            className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>Rename Column...</span>
          </button>

          {/* Drop Column */}
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Are you sure you want to drop column "${column}"?`)) {
                onApplyAction('drop_column', column);
                onClose();
              }
            }}
            className="w-full px-3.5 py-2 text-left flex items-center gap-2.5 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Drop Column</span>
          </button>
        </div>
      </div>

      {/* Split Modal */}
      {showSplitModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl p-5 w-full max-w-sm shadow-2xl space-y-4">
            <h4 className="font-semibold text-sm text-[var(--text-primary)]">Split Column by Delimiter</h4>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[var(--text-muted)] mb-1 font-medium">Delimiter Character</label>
                <div className="grid grid-cols-4 gap-1.5 mb-2">
                  {[
                    { label: 'Space', val: ' ' },
                    { label: 'Comma', val: ',' },
                    { label: 'Dash', val: '-' },
                    { label: 'Pipe', val: '|' },
                  ].map((d) => (
                    <button
                      key={d.label}
                      type="button"
                      onClick={() => setSplitDelimiter(d.val)}
                      className={`px-2 py-1 rounded border text-[11px] cursor-pointer ${
                        splitDelimiter === d.val
                          ? 'bg-[#FF4B3E]/10 border-[#FF4B3E] text-[#FF4B3E]'
                          : 'bg-[var(--bg-app)] border-[var(--border-hairline)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={splitDelimiter}
                  onChange={(e) => setSplitDelimiter(e.target.value)}
                  placeholder="Custom delimiter"
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[var(--text-muted)] mb-1 font-medium">Part 1 Column Name</label>
                  <input
                    type="text"
                    value={splitCol1}
                    onChange={(e) => setSplitCol1(e.target.value)}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-muted)] mb-1 font-medium">Part 2 Column Name</label>
                  <input
                    type="text"
                    value={splitCol2}
                    onChange={(e) => setSplitCol2(e.target.value)}
                    className="w-full bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none font-mono"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-[var(--text-secondary)] cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={dropOriginal}
                  onChange={(e) => setDropOriginal(e.target.checked)}
                  className="rounded accent-[#FF4B3E]"
                />
                <span>Drop original column "{column}" after split</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-hairline)]">
              <button
                type="button"
                onClick={() => setShowSplitModal(false)}
                className="px-3 py-1.5 rounded text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onApplyAction('split_delimiter', column, {
                    delimiter: splitDelimiter,
                    num_parts: 2,
                    new_column_names: [splitCol1, splitCol2],
                    drop_original: dropOriginal,
                  });
                  setShowSplitModal(false);
                  onClose();
                }}
                className="px-4 py-1.5 rounded text-xs font-semibold bg-[#FF4B3E] hover:bg-[#E03E32] text-white cursor-pointer shadow-xs"
              >
                Apply Split
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Replace NULLs Modal */}
      {showNullModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl p-5 w-full max-w-xs shadow-2xl space-y-4">
            <h4 className="font-semibold text-sm text-[var(--text-primary)]">Replace NULL Values</h4>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[var(--text-muted)] mb-1 font-medium">Constant Default Value</label>
                <div className="flex gap-1.5 mb-2">
                  {['N/A', 'Unknown', '0', 'None'].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setNullDefaultValue(val)}
                      className={`px-2 py-1 rounded border text-[11px] cursor-pointer ${
                        nullDefaultValue === val
                          ? 'bg-[#FF4B3E]/10 border-[#FF4B3E] text-[#FF4B3E]'
                          : 'bg-[var(--bg-app)] border-[var(--border-hairline)] text-[var(--text-secondary)]'
                      }`}
                    >
                      {val}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={nullDefaultValue}
                  onChange={(e) => setNullDefaultValue(e.target.value)}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-hairline)]">
              <button
                type="button"
                onClick={() => setShowNullModal(false)}
                className="px-3 py-1.5 rounded text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onApplyAction('replace_nulls', column, { value: nullDefaultValue });
                  setShowNullModal(false);
                  onClose();
                }}
                className="px-4 py-1.5 rounded text-xs font-semibold bg-[#FF4B3E] hover:bg-[#E03E32] text-white cursor-pointer shadow-xs"
              >
                Replace NULLs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {showRenameModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-xl p-5 w-full max-w-xs shadow-2xl space-y-4">
            <h4 className="font-semibold text-sm text-[var(--text-primary)]">Rename Column</h4>
            <div className="space-y-2 text-xs">
              <label className="block text-[var(--text-muted)] font-medium">New Column Name</label>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="w-full bg-[var(--bg-app)] border border-[var(--border-hairline)] rounded px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none font-mono"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-hairline)]">
              <button
                type="button"
                onClick={() => setShowRenameModal(false)}
                className="px-3 py-1.5 rounded text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onApplyAction('rename_column', column, { new_name: renameValue });
                  setShowRenameModal(false);
                  onClose();
                }}
                className="px-4 py-1.5 rounded text-xs font-semibold bg-[#FF4B3E] hover:bg-[#E03E32] text-white cursor-pointer shadow-xs"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
