// Project lint rules.
//  - no-words: user-visible text may only use the characters Spec-ReadMe allows (numerals, ":",
//    "/", "-", "°", "×", plus "." as the decimal point the design itself shows). Words belong in
//    accessibility labels (src/core/a11y.ts) and OS permission strings (app.json) only.
//  - no-hardcoded-colors: colors come from src/theme/tokens.ts.
//  - no-network: no fetch/XMLHttpRequest/WebSocket/EventSource anywhere in app source.
const VISIBLE = /^[0-9:/\-°×.\s]*$/;
const A11Y_PROPS = new Set(['accessibilityLabel', 'accessibilityHint', 'accessibilityValue', 'aria-label', 'accessibilityActions', 'testID', 'nativeID', 'key']);

function isVisibleTextLiteral(node) {
  return typeof node.value === 'string' && !VISIBLE.test(node.value);
}

module.exports = {
  rules: {
    'no-words': {
      meta: { type: 'problem', schema: [] },
      create(context) {
        return {
          JSXText(node) {
            if (node.value.trim() && !VISIBLE.test(node.value)) {
              context.report({ node, message: `Visible text "${node.value.trim()}" is not allowed: the UI has no words.` });
            }
          },
          // String literals rendered as children: <Text>{'abc'}</Text>
          'JSXExpressionContainer > Literal'(node) {
            if (node.parent.parent.type === 'JSXElement' && isVisibleTextLiteral(node)) {
              context.report({ node, message: `Visible text "${node.value}" is not allowed: the UI has no words.` });
            }
          },
          'JSXExpressionContainer > TemplateLiteral'(node) {
            if (node.parent.parent.type !== 'JSXElement') return;
            for (const q of node.quasis) {
              if (!VISIBLE.test(q.value.cooked)) context.report({ node, message: 'Visible template text must be numerals/allowed symbols only.' });
            }
          },
          // Visible string props on text-like components (Skia/RN): text="..." / title="..."
          JSXAttribute(node) {
            const name = node.name && node.name.name;
            if (!name || A11Y_PROPS.has(name)) return;
            if (!['text', 'title', 'children', 'placeholder'].includes(name)) return;
            if (node.value && node.value.type === 'Literal' && isVisibleTextLiteral(node.value)) {
              context.report({ node, message: `Visible prop ${name}="${node.value.value}" is not allowed: the UI has no words.` });
            }
          },
          // Paragraph text: builder.addText('...')
          'CallExpression[callee.property.name="addText"] > Literal'(node) {
            if (isVisibleTextLiteral(node)) context.report({ node, message: `Visible text "${node.value}" is not allowed.` });
          },
        };
      },
    },
    'no-hardcoded-colors': {
      meta: { type: 'problem', schema: [] },
      create(context) {
        const file = context.filename || context.getFilename();
        if (/theme[\\/]tokens\.ts$/.test(file)) return {};
        const re = /^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/;
        return {
          Literal(node) {
            if (typeof node.value === 'string' && re.test(node.value.trim())) {
              context.report({ node, message: 'Use a color token from src/theme/tokens.ts.' });
            }
          },
        };
      },
    },
    'no-network': {
      meta: { type: 'problem', schema: [] },
      create(context) {
        const banned = new Set(['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']);
        return {
          Identifier(node) {
            if (banned.has(node.name) && node.parent.type !== 'Property' && node.parent.type !== 'MemberExpression') {
              context.report({ node, message: `${node.name}: the app makes no network calls.` });
            }
          },
          'MemberExpression[property.name=/^(fetch|sendBeacon)$/]'(node) {
            context.report({ node, message: 'The app makes no network calls.' });
          },
        };
      },
    },
  },
};
