import { useEffect, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap, autocompletion } from '@codemirror/autocomplete';
import { pythonCompletionSource, markdownCompletionSource } from '../utils/completions';
import type { CellType } from '../types';

interface CellEditorProps {
  source: string;
  cellType: CellType;
  autocompleteEnabled: boolean;
  onChange: (value: string) => void;
  onRun: () => void;
  onRunAndInsert: () => void;
  onFocusUp?: () => void;
  onFocusDown?: () => void;
  autoFocus?: boolean;
}

export function CellEditor({
  source,
  cellType,
  autocompleteEnabled,
  onChange,
  onRun,
  onRunAndInsert,
  onFocusUp,
  onFocusDown,
  autoFocus,
}: CellEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const autocompleteCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  const onRunAndInsertRef = useRef(onRunAndInsert);
  const onFocusUpRef = useRef(onFocusUp);
  const onFocusDownRef = useRef(onFocusDown);

  onChangeRef.current = onChange;
  onRunRef.current = onRun;
  onRunAndInsertRef.current = onRunAndInsert;
  onFocusUpRef.current = onFocusUp;
  onFocusDownRef.current = onFocusDown;

  // Build the autocomplete extension based on cell type
  const buildAutocompleteExt = (enabled: boolean, type: CellType) => {
    if (!enabled) return [];
    const completionSource = type === 'code' ? pythonCompletionSource : markdownCompletionSource;
    return autocompletion({
      override: [completionSource],
      activateOnTyping: true,
      maxRenderedOptions: 12,
      icons: true,
    });
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const cellKeymap = keymap.of([
      {
        key: 'Mod-z',
        run: () => {
          window.dispatchEvent(new CustomEvent('lab:tree-undo'));
          return true;
        },
      },
      {
        key: 'Mod-Shift-z',
        run: () => {
          window.dispatchEvent(new CustomEvent('lab:tree-redo'));
          return true;
        },
      },
      {
        key: 'Shift-Enter',
        run: () => {
          onRunRef.current();
          return true;
        },
      },
      {
        key: 'Alt-Enter',
        run: () => {
          onRunAndInsertRef.current();
          return true;
        },
      },
      {
        key: 'ArrowUp',
        run: (view) => {
          const { from } = view.state.selection.main;
          const line = view.state.doc.lineAt(from);
          if (line.number === 1) {
            onFocusUpRef.current?.();
            return true;
          }
          return false;
        },
      },
      {
        key: 'ArrowDown',
        run: (view) => {
          const { from } = view.state.selection.main;
          const line = view.state.doc.lineAt(from);
          if (line.number === view.state.doc.lines) {
            onFocusDownRef.current?.();
            return true;
          }
          return false;
        },
      },
    ]);

    const lang = cellType === 'markdown' ? markdown() : python();

    const state = EditorState.create({
      doc: source,
      extensions: [
        cellKeymap,
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        lang,
        oneDark,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        bracketMatching(),
        closeBrackets(),
        history(),
        autocompleteCompartment.current.of(buildAutocompleteExt(autocompleteEnabled, cellType)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          '&': { maxHeight: '600px' },
          '.cm-scroller': { overflow: 'auto' },
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    if (autoFocus) {
      view.focus();
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [cellType]); // Recreate when cell type changes

  // Dynamically toggle autocomplete without recreating editor
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: autocompleteCompartment.current.reconfigure(
        buildAutocompleteExt(autocompleteEnabled, cellType)
      ),
    });
  }, [autocompleteEnabled, cellType]);

  // Update content if source changes externally
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== source) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: source },
      });
    }
  }, [source]);

  return <div ref={containerRef} className="min-h-[36px]" />;
}

export function focusCellEditor(container: HTMLElement) {
  const cmContent = container.querySelector('.cm-content') as HTMLElement;
  cmContent?.focus();
}
