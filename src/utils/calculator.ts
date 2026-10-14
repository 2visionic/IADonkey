import type { LauncherItem } from '../types';

/**
 * Safely evaluates math expressions without using eval().
 * Supports basic arithmetic (+, -, *, /, ^, %), parentheses, common functions, and logical operators.
 */
export function evaluateExpression(query: string): LauncherItem | null {
  const trimmed = query.trim();
  if (trimmed.length < 1) return null;

  // Must contain at least one digit and either an operator or a math function
  const hasDigit = /\d/.test(trimmed);
  const hasMathOp = /[+\-*/%^=<>!]|sqrt|sin|cos|tan|log|abs|round|floor|ceil|pow|pi|e\b/i.test(trimmed);
  
  if (!hasDigit || !hasMathOp) {
    return null;
  }

  // Check if string contains illegal characters (security and non-math guard)
  // Allowed: digits, operators, parentheses, commas/dots, spaces, known functions/constants
  const sanitized = trimmed
    .replace(/\b(pi|PI)\b/g, `${Math.PI}`)
    .replace(/\b(e|E)\b/g, `${Math.E}`);

  // Disallow letters other than safe math functions
  const disallowedLetters = sanitized.replace(/\b(sqrt|sin|cos|tan|abs|round|floor|ceil|log|pow)\b/gi, '')
    .replace(/[a-zA-Z_]/g, '#');
  if (disallowedLetters.includes('#')) {
    return null;
  }

  try {
    // Simple recursive descent parser or tokenizer evaluator
    const result = safeMathEval(trimmed);
    if (result === null || typeof result === 'undefined') {
      return null;
    }
    if (typeof result === 'number' && (!Number.isFinite(result) || Number.isNaN(result))) {
      return null;
    }

    // Format result nicely
    let formattedResult = '';
    if (typeof result === 'boolean') {
      formattedResult = result ? 'Pravda (true)' : 'Nepravda (false)';
    } else {
      // Limit decimal places if needed
      formattedResult = Number.isInteger(result) ? result.toString() : parseFloat(result.toFixed(8)).toString();
    }

    return {
      id: 'calculator-result',
      name: formattedResult,
      location: `= ${trimmed} (Enter zkopíruje výsledek)`,
      action: 'copy',
      icon: 'calculate',
      image: null,
      priority: -1,
      settings: null,
    };
  } catch {
    return null;
  }
}

/**
 * Tokenizer and parser for safe arithmetic and comparison expressions
 */
function safeMathEval(expr: string): number | boolean | null {
  // Preserve argument separator in pow(a, b) using semicolon before converting decimal commas to dots
  let s = expr.trim()
    .replace(/\bpow\s*\(([^,()]+),([^()]+)\)/gi, 'pow($1;$2)')
    .replace(/,/g, '.')
    .replace(/×/g, '*')
    .replace(/÷/g, '/');

  // Handle logical equality / comparison if present
  if (s.includes('==') || s.includes('!=') || s.includes('>=') || s.includes('<=') || s.includes('>') || s.includes('<')) {
    const match = s.match(/^(.+?)(==|!=|>=|<=|>|<)(.+)$/);
    if (match) {
      const leftVal = evalMathOnly(match[1].trim());
      const op = match[2];
      const rightVal = evalMathOnly(match[3].trim());
      if (leftVal !== null && rightVal !== null) {
        switch (op) {
          case '==': return leftVal === rightVal;
          case '!=': return leftVal !== rightVal;
          case '>=': return leftVal >= rightVal;
          case '<=': return leftVal <= rightVal;
          case '>': return leftVal > rightVal;
          case '<': return leftVal < rightVal;
        }
      }
    }
  }

  return evalMathOnly(s);
}

function evalMathOnly(expr: string): number | null {
  // Tokens regex
  const tokens: string[] = [];
  const tokenRegex = /\s*(\d+(?:\.\d+)?|[+\-*/^%();]|[a-zA-Z]+)\s*/g;
  let match;
  let lastIndex = 0;

  while ((match = tokenRegex.exec(expr)) !== null) {
    if (match.index !== lastIndex) {
      return null; // Invalid token sequence
    }
    tokens.push(match[1]);
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex !== expr.length || tokens.length === 0) {
    return null;
  }

  let pos = 0;

  function peek(): string | undefined {
    return tokens[pos];
  }

  function consume(expected?: string): string {
    const t = tokens[pos];
    if (expected && t !== expected) {
      throw new Error(`Expected ${expected} but got ${t}`);
    }
    pos++;
    return t;
  }

  function parseExpression(): number {
    let result = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const right = parseTerm();
      result = op === '+' ? result + right : result - right;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = consume();
      const right = parseFactor();
      if (op === '*') result = result * right;
      else if (op === '/') {
        if (right === 0) throw new Error('Division by zero');
        result = result / right;
      } else if (op === '%') result = result % right;
    }
    return result;
  }

  function parseFactor(): number {
    let result = parseUnary();
    if (peek() === '^') {
      consume();
      const right = parseFactor(); // right-associative
      result = Math.pow(result, right);
    }
    return result;
  }

  function parseUnary(): number {
    if (peek() === '+') {
      consume();
      return parseUnary();
    }
    if (peek() === '-') {
      consume();
      return -parseUnary();
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const t = peek();
    if (!t) throw new Error('Unexpected end of expression');

    if (t === '(') {
      consume('(');
      const val = parseExpression();
      consume(')');
      return val;
    }

    if (t.toLowerCase() === 'pi') {
      consume();
      return Math.PI;
    }
    if (t.toLowerCase() === 'e') {
      consume();
      return Math.E;
    }

    // Function calls
    if (/^(sqrt|sin|cos|tan|abs|round|floor|ceil|log|pow)$/i.test(t)) {
      const fn = consume().toLowerCase();
      consume('(');
      const arg = parseExpression();
      if (fn === 'pow') {
        consume(';');
        const expArg = parseExpression();
        consume(')');
        return Math.pow(arg, expArg);
      }
      consume(')');
      switch (fn) {
        case 'sqrt': return Math.sqrt(arg);
        case 'sin': return Math.sin(arg);
        case 'cos': return Math.cos(arg);
        case 'tan': return Math.tan(arg);
        case 'abs': return Math.abs(arg);
        case 'round': return Math.round(arg);
        case 'floor': return Math.floor(arg);
        case 'ceil': return Math.ceil(arg);
        case 'log': return Math.log(arg);
      }
    }

    if (/^\d+(\.\d+)?$/.test(t)) {
      consume();
      return parseFloat(t);
    }

    throw new Error(`Unexpected token: ${t}`);
  }

  try {
    const res = parseExpression();
    if (pos !== tokens.length) return null;
    return res;
  } catch {
    return null;
  }
}
