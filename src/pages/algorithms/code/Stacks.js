// Stacks — array-backed stack + balanced-brackets classic.
export const STACK_CORE_CODE = {
  pseudo: `push(v): arr[++top] = v
pop(): return arr[top--]
peek(): return arr[top]
size(): return top + 1`,

  c: `#include <stdlib.h>

typedef struct { int *a; int top; int cap; } Stack;

void push(Stack *s, int v) {
    if (s->top + 1 >= s->cap) {
        s->cap = s->cap ? s->cap * 2 : 8;
        s->a = realloc(s->a, s->cap * sizeof(int));
    }
    s->a[++s->top] = v;
}
int  pop(Stack *s)  { return s->a[s->top--]; }
int  peek(Stack *s) { return s->a[s->top]; }
int  size(Stack *s) { return s->top + 1; }`,

  cpp: `#include <stack>
#include <vector>

// std::stack is a container adaptor — vector-backed by default.
std::stack<int> s;
s.push(42);
int top = s.top();   // peek
s.pop();             // removes, does NOT return`,

  python: `# Python list doubles as a stack — append / pop are amortised O(1).
stack = []
stack.append(42)      # push
top = stack[-1]       # peek
val = stack.pop()     # pop returns the value
n   = len(stack)      # size`,

  java: `import java.util.ArrayDeque;
import java.util.Deque;

// ArrayDeque is the preferred stack in modern Java (java.util.Stack is legacy).
Deque<Integer> stack = new ArrayDeque<>();
stack.push(42);
int top = stack.peek();
int val = stack.pop();
int n   = stack.size();`,

  rust: `// Rust's Vec is the canonical stack: push / pop are amortised O(1).
let mut stack: Vec<i32> = Vec::new();
stack.push(42);
let top = *stack.last().unwrap();   // peek
let val = stack.pop().unwrap();
let n   = stack.len();`,
}

export const STACK_BRACKETS_CODE = {
  pseudo: `function isBalanced(s):
    stack = []
    for c in s:
        if c in "([{":
            stack.push(c)
        else if c in ")]}":
            if stack.isEmpty(): return false
            if match(stack.pop(), c) == false: return false
    return stack.isEmpty()`,

  c: `#include <stdbool.h>
#include <string.h>

static bool matches(char o, char c) {
    return (o == '(' && c == ')') || (o == '[' && c == ']') || (o == '{' && c == '}');
}

bool is_balanced(const char *s) {
    char stk[1024]; int top = -1;
    for (; *s; s++) {
        char c = *s;
        if (strchr("([{", c))       stk[++top] = c;
        else if (strchr(")]}", c)) {
            if (top < 0 || !matches(stk[top--], c)) return false;
        }
    }
    return top == -1;
}`,

  cpp: `#include <stack>
#include <string>

bool is_balanced(const std::string& s) {
    std::stack<char> st;
    for (char c : s) {
        if (c == '(' || c == '[' || c == '{') st.push(c);
        else if (c == ')' || c == ']' || c == '}') {
            if (st.empty()) return false;
            char o = st.top(); st.pop();
            if ((o == '(' && c != ')') || (o == '[' && c != ']') || (o == '{' && c != '}'))
                return false;
        }
    }
    return st.empty();
}`,

  python: `def is_balanced(s: str) -> bool:
    pair = {')': '(', ']': '[', '}': '{'}
    stack = []
    for c in s:
        if c in "([{":
            stack.append(c)
        elif c in ")]}":
            if not stack or stack.pop() != pair[c]:
                return False
    return not stack`,

  java: `import java.util.ArrayDeque;
import java.util.Deque;

public static boolean isBalanced(String s) {
    Deque<Character> st = new ArrayDeque<>();
    for (char c : s.toCharArray()) {
        if (c == '(' || c == '[' || c == '{') st.push(c);
        else if (c == ')' || c == ']' || c == '}') {
            if (st.isEmpty()) return false;
            char o = st.pop();
            if ((o == '(' && c != ')') || (o == '[' && c != ']') || (o == '{' && c != '}'))
                return false;
        }
    }
    return st.isEmpty();
}`,

  rust: `pub fn is_balanced(s: &str) -> bool {
    let mut stk: Vec<char> = Vec::new();
    for c in s.chars() {
        match c {
            '(' | '[' | '{' => stk.push(c),
            ')' | ']' | '}' => {
                let o = match stk.pop() { Some(x) => x, None => return false };
                if (o == '(' && c != ')') || (o == '[' && c != ']') || (o == '{' && c != '}') {
                    return false;
                }
            }
            _ => {}
        }
    }
    stk.is_empty()
}`,
}
