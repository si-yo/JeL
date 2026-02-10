/**
 * Code Sandbox - Static validation of received Python code
 * Detects dangerous patterns before execution
 */

interface ValidationResult {
  safe: boolean;
  warnings: string[];
}

const DANGEROUS_PATTERNS: { pattern: RegExp; description: string }[] = [
  { pattern: /\bos\.system\s*\(/, description: 'os.system() - execution systeme' },
  { pattern: /\bsubprocess\b/, description: 'module subprocess' },
  { pattern: /\beval\s*\(/, description: 'eval() - execution de code dynamique' },
  { pattern: /\bexec\s*\(/, description: 'exec() - execution de code dynamique' },
  { pattern: /\b__import__\s*\(/, description: '__import__() - import dynamique' },
  { pattern: /\bopen\s*\([^)]*(['"])[wa+x]/, description: 'open() en mode ecriture' },
  { pattern: /\bshutil\./, description: 'module shutil - operations fichiers' },
  { pattern: /\brequests\.(?:post|put|delete|patch)\b/, description: 'requetes HTTP mutantes' },
  { pattern: /\bsocket\./, description: 'module socket - reseau bas niveau' },
  { pattern: /\bctypes\b/, description: 'module ctypes - acces memoire' },
  { pattern: /\bsys\.exit\s*\(/, description: 'sys.exit() - arret du process' },
  { pattern: /\bos\.remove\s*\(/, description: 'os.remove() - suppression fichier' },
  { pattern: /\bos\.rmdir\s*\(/, description: 'os.rmdir() - suppression repertoire' },
  { pattern: /\bos\.unlink\s*\(/, description: 'os.unlink() - suppression fichier' },
  { pattern: /\bos\.environ\b/, description: 'os.environ - acces variables environnement' },
  { pattern: /\bos\.path\.expanduser\b/, description: 'os.path.expanduser - acces home' },
  { pattern: /\bglob\.\b/, description: 'module glob - scan fichiers' },
  { pattern: /\bpickle\.loads?\b/, description: 'pickle - deserialisation non sure' },
  { pattern: /\bcompile\s*\(/, description: 'compile() - compilation de code' },
  { pattern: /\b__builtins__\b/, description: '__builtins__ - acces aux builtins' },
  { pattern: /\bgetattr\s*\(/, description: 'getattr() - acces attribut dynamique' },
  { pattern: /\bimport\s+(?:os|sys|subprocess|shutil|ctypes|socket|pickle)\b/, description: 'import de module dangereux' },
  { pattern: /\bfrom\s+(?:os|sys|subprocess|shutil|ctypes|socket|pickle)\s+import\b/, description: 'import depuis module dangereux' },
];

export function validateReceivedCode(code: string): ValidationResult {
  const warnings: string[] = [];

  for (const { pattern, description } of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      warnings.push(description);
    }
  }

  return {
    safe: warnings.length === 0,
    warnings,
  };
}

/**
 * Wrap unsafe code with a warning that will be displayed in kernel output
 */
export function wrapUnsafeCode(code: string, warnings: string[]): string {
  const warningList = warnings.map((w) => `  - ${w}`).join('\\n');
  return `raise SecurityError("""
Code distant refuse - patterns dangereux detectes:
${warningList}

Utilisez %ask --force pour forcer l'execution (a vos risques).
""")`;
}
