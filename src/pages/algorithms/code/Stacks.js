// Stacks — classic push/pop core + balanced brackets checker.
export const STACK_CORE_CODE = {
  pseudo: `function push(v):
    if size == CAP: return FULL
    data[size] = v
    size += 1

function pop():
    if size == 0: return EMPTY
    size -= 1
    return data[size]`,

  c: `#include <stdio.h>
#include <stdbool.h>
#define CAP 16

typedef struct { int data[CAP]; int size; } Stack;

bool push(Stack *s, int v) {
    if (s->size == CAP) return false;
    s->data[s->size++] = v;
    return true;
}
int pop(Stack *s) { return s->data[--s->size]; }

int main(void) {
    Stack s = {.size = 0};
    for (int i = 1; i <= 5; i++) push(&s, i);   // push 1..5
    printf("Popped:");
    while (s.size) printf(" %d", pop(&s));
    printf("\\n");
    return 0;
}`,

  cpp: `#include <iostream>
#include <stack>

int main() {
    std::stack<int> s;
    for (int i = 1; i <= 5; i++) s.push(i);
    std::cout << "Popped:";
    while (!s.empty()) { std::cout << " " << s.top(); s.pop(); }
    std::cout << "\\n";
    return 0;
}`,

  python: `if __name__ == "__main__":
    s = []
    for i in range(1, 6):
        s.append(i)           # push
    out = []
    while s:
        out.append(s.pop())   # pop from end — LIFO
    print("Popped:", out)`,

  java: `import java.util.ArrayDeque;
import java.util.Deque;

public class Main {
    public static void main(String[] args) {
        Deque<Integer> s = new ArrayDeque<>();
        for (int i = 1; i <= 5; i++) s.push(i);
        StringBuilder sb = new StringBuilder("Popped:");
        while (!s.isEmpty()) sb.append(" ").append(s.pop());
        System.out.println(sb);
    }
}`,

  rust: `fn main() {
    let mut s: Vec<i32> = Vec::new();
    for i in 1..=5 { s.push(i); }
    let mut out = Vec::new();
    while let Some(v) = s.pop() { out.push(v); }
    println!("Popped: {:?}", out);
}`,
}

export const STACK_CORE_SAMPLES = [
  { name: 'Push 1..5', description: 'Push then pop 1..5 — verify LIFO', stdin: '', expected: '' },
  { name: 'Push 1..3', description: 'Small stack', stdin: '', expected: '' },
]

export const STACK_BRACKETS_CODE = {
  pseudo: `function balanced(s):
    stack = []
    for c in s:
        if c in "([{":
            stack.push(c)
        else if c in ")]}":
            if stack.empty() or !matches(stack.top(), c):
                return false
            stack.pop()
    return stack.empty()`,

  c: `#include <stdio.h>
#include <string.h>
#include <stdbool.h>

bool balanced(const char *s) {
    char st[256]; int top = 0;
    for (; *s; s++) {
        char c = *s;
        if (c == '(' || c == '[' || c == '{') st[top++] = c;
        else if (c == ')' || c == ']' || c == '}') {
            if (top == 0) return false;
            char o = st[--top];
            if ((c == ')' && o != '(') || (c == ']' && o != '[') || (c == '}' && o != '{'))
                return false;
        }
    }
    return top == 0;
}

int main(void) {
    const char *cases[] = { "()[]{}", "([)]", "{[()()]}", "((", "" };
    for (int i = 0; i < 5; i++)
        printf("balanced(\\"%s\\") = %s\\n", cases[i], balanced(cases[i]) ? "true" : "false");
    return 0;
}`,

  cpp: `#include <iostream>
#include <stack>
#include <string>

bool balanced(const std::string& s) {
    std::stack<char> st;
    for (char c : s) {
        if (c == '(' || c == '[' || c == '{') st.push(c);
        else if (c == ')' || c == ']' || c == '}') {
            if (st.empty()) return false;
            char o = st.top(); st.pop();
            if ((c == ')' && o != '(') || (c == ']' && o != '[') || (c == '}' && o != '{'))
                return false;
        }
    }
    return st.empty();
}

int main() {
    for (const std::string& s : {"()[]{}", "([)]", "{[()()]}", "((", ""})
        std::cout << "balanced(\\"" << s << "\\") = " << (balanced(s) ? "true" : "false") << "\\n";
    return 0;
}`,

  python: `def balanced(s: str) -> bool:
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for c in s:
        if c in '([{':
            stack.append(c)
        elif c in ')]}':
            if not stack or stack.pop() != pairs[c]:
                return False
    return not stack

if __name__ == "__main__":
    for s in ["()[]{}", "([)]", "{[()()]}", "((", ""]:
        print(f'balanced("{s}") = {balanced(s)}')`,

  java: `public class Main {
    public static boolean balanced(String s) {
        java.util.Deque<Character> st = new java.util.ArrayDeque<>();
        for (char c : s.toCharArray()) {
            if (c == '(' || c == '[' || c == '{') st.push(c);
            else if (c == ')' || c == ']' || c == '}') {
                if (st.isEmpty()) return false;
                char o = st.pop();
                if ((c == ')' && o != '(') || (c == ']' && o != '[') || (c == '}' && o != '{'))
                    return false;
            }
        }
        return st.isEmpty();
    }
    public static void main(String[] args) {
        for (String s : new String[]{"()[]{}", "([)]", "{[()()]}", "((", ""})
            System.out.println("balanced(\\"" + s + "\\") = " + balanced(s));
    }
}`,

  rust: `fn balanced(s: &str) -> bool {
    let mut st: Vec<char> = Vec::new();
    for c in s.chars() {
        match c {
            '(' | '[' | '{' => st.push(c),
            ')' | ']' | '}' => {
                let o = match st.pop() { Some(x) => x, None => return false };
                if (c == ')' && o != '(') || (c == ']' && o != '[') || (c == '}' && o != '{') {
                    return false;
                }
            }
            _ => {}
        }
    }
    st.is_empty()
}

fn main() {
    for s in ["()[]{}", "([)]", "{[()()]}", "((", ""] {
        println!("balanced(\\"{}\\") = {}", s, balanced(s));
    }
}`,
}

export const STACK_BRACKETS_SAMPLES = [
  { name: 'All matched',  description: '()[]{}', stdin: '', expected: '' },
  { name: 'Wrong nest',   description: '([)] — brackets interleave', stdin: '', expected: '' },
  { name: 'Deep nest',    description: '{[()()]}', stdin: '', expected: '' },
  { name: 'Unclosed',     description: '(( — never closed', stdin: '', expected: '' },
  { name: 'Empty',        description: 'empty string is balanced', stdin: '', expected: '' },
]
