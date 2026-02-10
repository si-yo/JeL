import type { CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete';

// =============================================
// Python completions
// =============================================

const pythonKeywords: Completion[] = [
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
  'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
  'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
  'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
  'while', 'with', 'yield',
].map((kw) => ({ label: kw, type: 'keyword' }));

const pythonBuiltins: Completion[] = [
  'print', 'len', 'range', 'type', 'str', 'int', 'float', 'list',
  'dict', 'set', 'tuple', 'bool', 'bytes', 'bytearray', 'memoryview',
  'complex', 'frozenset', 'object', 'super', 'property',
  'open', 'input', 'map', 'filter', 'zip', 'enumerate', 'sorted',
  'reversed', 'sum', 'min', 'max', 'abs', 'round', 'pow', 'divmod',
  'hash', 'id', 'hex', 'oct', 'bin', 'ord', 'chr', 'ascii', 'repr',
  'format', 'eval', 'exec', 'compile', 'dir', 'vars', 'locals', 'globals',
  'isinstance', 'issubclass', 'hasattr', 'getattr', 'setattr', 'delattr',
  'callable', 'classmethod', 'staticmethod', 'iter', 'next', 'slice',
  'any', 'all',
].map((fn) => ({ label: fn, type: 'function', detail: 'builtin' }));

const pythonExceptions: Completion[] = [
  'Exception', 'BaseException', 'ValueError', 'TypeError', 'KeyError',
  'IndexError', 'AttributeError', 'ImportError', 'ModuleNotFoundError',
  'FileNotFoundError', 'IOError', 'OSError', 'RuntimeError', 'StopIteration',
  'ZeroDivisionError', 'OverflowError', 'MemoryError', 'RecursionError',
  'NotImplementedError', 'NameError', 'SyntaxError', 'IndentationError',
  'UnicodeError', 'UnicodeDecodeError', 'UnicodeEncodeError',
  'ArithmeticError', 'LookupError', 'AssertionError', 'EOFError',
  'ConnectionError', 'TimeoutError', 'PermissionError',
].map((e) => ({ label: e, type: 'class', detail: 'exception' }));

const pythonModules: Completion[] = [
  { label: 'numpy', detail: 'import numpy as np', info: 'Numerical computing' },
  { label: 'pandas', detail: 'import pandas as pd', info: 'Data analysis' },
  { label: 'matplotlib', detail: 'import matplotlib.pyplot as plt', info: 'Plotting' },
  { label: 'matplotlib.pyplot', detail: 'as plt', info: 'Plotting' },
  { label: 'scipy', detail: 'import scipy', info: 'Scientific computing' },
  { label: 'sklearn', detail: 'import sklearn', info: 'Machine learning' },
  { label: 'torch', detail: 'import torch', info: 'PyTorch' },
  { label: 'tensorflow', detail: 'import tensorflow as tf', info: 'TensorFlow' },
  { label: 'os', detail: 'import os', info: 'OS interface' },
  { label: 'sys', detail: 'import sys', info: 'System' },
  { label: 'json', detail: 'import json', info: 'JSON' },
  { label: 'math', detail: 'import math', info: 'Math functions' },
  { label: 'random', detail: 'import random', info: 'Random numbers' },
  { label: 'datetime', detail: 'import datetime', info: 'Date and time' },
  { label: 'pathlib', detail: 'from pathlib import Path', info: 'File paths' },
  { label: 'collections', detail: 'import collections', info: 'Data structures' },
  { label: 'itertools', detail: 'import itertools', info: 'Iterators' },
  { label: 'functools', detail: 'import functools', info: 'Function tools' },
  { label: 're', detail: 'import re', info: 'Regular expressions' },
  { label: 'typing', detail: 'import typing', info: 'Type hints' },
  { label: 'csv', detail: 'import csv', info: 'CSV files' },
  { label: 'io', detail: 'import io', info: 'I/O streams' },
  { label: 'time', detail: 'import time', info: 'Time' },
  { label: 'logging', detail: 'import logging', info: 'Logging' },
  { label: 'subprocess', detail: 'import subprocess', info: 'Subprocesses' },
  { label: 'threading', detail: 'import threading', info: 'Threads' },
  { label: 'multiprocessing', detail: 'import multiprocessing', info: 'Processes' },
  { label: 'requests', detail: 'import requests', info: 'HTTP requests' },
  { label: 'sqlite3', detail: 'import sqlite3', info: 'SQLite' },
  { label: 'pickle', detail: 'import pickle', info: 'Serialization' },
  { label: 'hashlib', detail: 'import hashlib', info: 'Hashing' },
  { label: 'argparse', detail: 'import argparse', info: 'CLI args' },
].map((m) => ({ ...m, type: 'namespace' }));

const pythonSnippets: Completion[] = [
  { label: 'def', detail: 'function', apply: 'def ():\n    ', type: 'keyword' },
  { label: 'class', detail: 'class', apply: 'class :\n    def __init__(self):\n        ', type: 'keyword' },
  { label: 'if __name__', detail: 'main guard', apply: 'if __name__ == "__main__":\n    ', type: 'keyword' },
  { label: 'for i in range', detail: 'loop', apply: 'for i in range():\n    ', type: 'keyword' },
  { label: 'with open', detail: 'file open', apply: 'with open("", "r") as f:\n    ', type: 'keyword' },
  { label: 'try/except', detail: 'error handling', apply: 'try:\n    \nexcept Exception as e:\n    print(e)', type: 'keyword' },
  { label: 'list comprehension', detail: '[x for x in ...]', apply: '[x for x in ]', type: 'keyword' },
  { label: 'dict comprehension', detail: '{k: v for ...}', apply: '{k: v for k, v in .items()}', type: 'keyword' },
  { label: 'lambda', detail: 'anonymous function', apply: 'lambda x: ', type: 'keyword' },
  { label: 'import numpy as np', detail: 'numpy', apply: 'import numpy as np', type: 'text' },
  { label: 'import pandas as pd', detail: 'pandas', apply: 'import pandas as pd', type: 'text' },
  { label: 'import matplotlib.pyplot as plt', detail: 'matplotlib', apply: 'import matplotlib.pyplot as plt', type: 'text' },
];

// =============================================
// %use magic command completions
// =============================================

const magicCommands: Completion[] = [
  {
    label: '%use',
    detail: 'import notebook code',
    info: 'Import all code cells from another notebook',
    apply: '%use ',
    type: 'keyword',
    boost: 10,
  },
  {
    label: '%use notebook.ipynb',
    detail: 'all code cells',
    info: 'Import all code cells from the specified notebook',
    type: 'keyword',
    boost: 9,
  },
  {
    label: '%use notebook.ipynb:0',
    detail: 'specific cell index',
    info: 'Import code from a specific cell by its index',
    type: 'keyword',
    boost: 8,
  },
  {
    label: '%use notebook.ipynb:function_name',
    detail: 'specific function/class',
    info: 'Import a specific function or class definition',
    type: 'keyword',
    boost: 8,
  },
  {
    label: '%ask',
    detail: 'demander du code distant',
    info: 'Demande du code a un peer connecte via pubsub',
    apply: '%ask ',
    type: 'keyword',
    boost: 10,
  },
  {
    label: '%ask peer notebook.ipynb',
    detail: 'tout le code',
    info: 'Demande tout le code du notebook chez le peer',
    type: 'keyword',
    boost: 9,
  },
  {
    label: '%ask peer notebook.ipynb:function_name',
    detail: 'fonction specifique',
    info: 'Demande une fonction/classe specifique',
    type: 'keyword',
    boost: 8,
  },
  {
    label: '%ask --force peer notebook.ipynb',
    detail: 'forcer execution',
    info: 'Execute le code meme si le sandbox le refuse',
    type: 'keyword',
    boost: 7,
  },
];

// =============================================
// Markdown completions
// =============================================

const markdownSnippets: Completion[] = [
  { label: '# ', detail: 'Heading 1', type: 'keyword' },
  { label: '## ', detail: 'Heading 2', type: 'keyword' },
  { label: '### ', detail: 'Heading 3', type: 'keyword' },
  { label: '#### ', detail: 'Heading 4', type: 'keyword' },
  { label: '**bold**', detail: 'Bold text', apply: '****', type: 'keyword' },
  { label: '*italic*', detail: 'Italic text', apply: '**', type: 'keyword' },
  { label: '`code`', detail: 'Inline code', apply: '``', type: 'keyword' },
  { label: '```python', detail: 'Code block', apply: '```python\n\n```', type: 'keyword' },
  { label: '> blockquote', detail: 'Blockquote', apply: '> ', type: 'keyword' },
  { label: '- list item', detail: 'Unordered list', apply: '- ', type: 'keyword' },
  { label: '1. numbered', detail: 'Ordered list', apply: '1. ', type: 'keyword' },
  { label: '---', detail: 'Horizontal rule', type: 'keyword' },
  { label: '[link](url)', detail: 'Hyperlink', apply: '[]()', type: 'keyword' },
  { label: '![alt](url)', detail: 'Image', apply: '![]()', type: 'keyword' },
  { label: '| table |', detail: 'Table', apply: '| Header | Header |\n|--------|--------|\n| Cell   | Cell   |', type: 'keyword' },
  { label: '- [ ] task', detail: 'Task list', apply: '- [ ] ', type: 'keyword' },
  { label: '[[notebook]]', detail: 'Notebook link', apply: '[[]]', type: 'keyword' },
  { label: '$formula$', detail: 'Inline LaTeX', apply: '$$', type: 'keyword' },
  { label: '$$formula$$', detail: 'Block LaTeX', apply: '$$\n\n$$', type: 'keyword' },
];

// =============================================
// Completion sources
// =============================================

const allPythonCompletions = [
  ...pythonKeywords,
  ...pythonBuiltins,
  ...pythonExceptions,
  ...pythonSnippets,
];

export function pythonCompletionSource(context: CompletionContext): CompletionResult | null {
  // Match word characters including dots (for module paths)
  const word = context.matchBefore(/[\w.%]+/);
  if (!word) return null;
  if (word.from === word.to && !context.explicit) return null;

  const text = word.text.toLowerCase();

  // If line starts with 'import ' or 'from ', suggest modules
  const line = context.state.doc.lineAt(word.from);
  const lineText = line.text.trimStart();
  if (lineText.startsWith('import ') || lineText.startsWith('from ')) {
    return {
      from: word.from,
      options: pythonModules,
      validFor: /^[\w.]*$/,
    };
  }

  // If starts with %, suggest magic commands
  if (text.startsWith('%')) {
    return {
      from: word.from,
      options: magicCommands,
      validFor: /^[%\w./: ]*$/,
    };
  }

  return {
    from: word.from,
    options: allPythonCompletions,
    validFor: /^\w*$/,
  };
}

export function markdownCompletionSource(context: CompletionContext): CompletionResult | null {
  // Match from start of line or after common markdown chars
  const word = context.matchBefore(/[\w#*`>\-\[$!|]+/);
  if (!word) return null;
  if (word.from === word.to && !context.explicit) return null;

  return {
    from: word.from,
    options: markdownSnippets,
    validFor: /^[\w#*`>\-\[$!| ]*$/,
  };
}
