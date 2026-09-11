// Trees — N-ary tree traversals: pre / in (N-ary) / post / level order.
// Each variant is a runnable program that builds the same sample tree:
//
//        1
//      / | \
//     2  3  4
//    / \    |
//   5   6   7
//
// so students can compare outputs across traversals.

const C_HEADER = `#include <stdio.h>
#include <stdlib.h>
#define MAX_KIDS 8

typedef struct Node { int v; struct Node *kids[MAX_KIDS]; int nk; } Node;

static Node* mk(int v) {
    Node *n = calloc(1, sizeof(Node));
    n->v = v; n->nk = 0;
    return n;
}
static void add(Node *p, Node *c) { p->kids[p->nk++] = c; }
static Node* build_sample(void) {
    Node *r = mk(1);
    Node *a = mk(2), *b = mk(3), *c = mk(4);
    Node *d = mk(5), *e = mk(6), *f = mk(7);
    add(r, a); add(r, b); add(r, c);
    add(a, d); add(a, e);
    add(c, f);
    return r;
}
`

const CPP_HEADER = `#include <iostream>
#include <vector>
#include <queue>

struct Node { int v; std::vector<Node*> kids; };

static Node* mk(int v) { auto *n = new Node(); n->v = v; return n; }
static Node* build_sample() {
    Node *r = mk(1);
    Node *a = mk(2), *b = mk(3), *c = mk(4);
    Node *d = mk(5), *e = mk(6), *f = mk(7);
    r->kids = {a, b, c};
    a->kids = {d, e};
    c->kids = {f};
    return r;
}
`

const PY_HEADER = `from collections import deque

class Node:
    def __init__(self, v):
        self.v = v; self.kids = []

def build_sample():
    r = Node(1)
    a, b, c = Node(2), Node(3), Node(4)
    d, e, f = Node(5), Node(6), Node(7)
    r.kids = [a, b, c]; a.kids = [d, e]; c.kids = [f]
    return r
`

const JAVA_HEADER = `import java.util.*;

public class Main {
    static class Node { int v; List<Node> kids = new ArrayList<>(); Node(int x){v=x;} }

    static Node buildSample() {
        Node r = new Node(1);
        Node a = new Node(2), b = new Node(3), c = new Node(4);
        Node d = new Node(5), e = new Node(6), f = new Node(7);
        r.kids.add(a); r.kids.add(b); r.kids.add(c);
        a.kids.add(d); a.kids.add(e);
        c.kids.add(f);
        return r;
    }
`

const RUST_HEADER = `use std::collections::VecDeque;

struct Node { v: i32, kids: Vec<Box<Node>> }

fn mk(v: i32) -> Box<Node> { Box::new(Node { v, kids: vec![] }) }
fn build_sample() -> Box<Node> {
    let mut r = mk(1);
    let mut a = mk(2);
    let b = mk(3);
    let mut c = mk(4);
    a.kids.push(mk(5));
    a.kids.push(mk(6));
    c.kids.push(mk(7));
    r.kids.push(a);
    r.kids.push(b);
    r.kids.push(c);
    r
}
`

export const TREES_PRE = {
  pseudo: `preOrder(node):
    visit(node)
    for c in node.children:
        preOrder(c)`,

  c: `${C_HEADER}
void preOrder(Node *n) {
    if (!n) return;
    printf("%d ", n->v);
    for (int i = 0; i < n->nk; i++) preOrder(n->kids[i]);
}

int main(void) {
    Node *root = build_sample();
    printf("Pre-order: ");
    preOrder(root);
    printf("\\n");
    return 0;
}`,

  cpp: `${CPP_HEADER}
void preOrder(Node* n) {
    if (!n) return;
    std::cout << n->v << ' ';
    for (Node* c : n->kids) preOrder(c);
}

int main() {
    Node* root = build_sample();
    std::cout << "Pre-order: ";
    preOrder(root);
    std::cout << "\\n";
    return 0;
}`,

  python: `${PY_HEADER}
def pre_order(n, out):
    if n is None: return
    out.append(n.v)
    for c in n.kids: pre_order(c, out)

if __name__ == "__main__":
    root = build_sample()
    out = []
    pre_order(root, out)
    print("Pre-order:", out)
`,

  java: `${JAVA_HEADER}
    static void preOrder(Node n, StringBuilder sb) {
        if (n == null) return;
        sb.append(n.v).append(" ");
        for (Node c : n.kids) preOrder(c, sb);
    }
    public static void main(String[] args) {
        Node root = buildSample();
        StringBuilder sb = new StringBuilder("Pre-order: ");
        preOrder(root, sb);
        System.out.println(sb);
    }
}`,

  rust: `${RUST_HEADER}
fn pre_order(n: &Node, out: &mut Vec<i32>) {
    out.push(n.v);
    for c in &n.kids { pre_order(c, out); }
}

fn main() {
    let root = build_sample();
    let mut out = Vec::new();
    pre_order(&root, &mut out);
    println!("Pre-order: {:?}", out);
}`,
}

export const TREES_IN = {
  pseudo: `inOrder(node):     // N-ary variant
    half = children.length / 2
    for c in children[0..half]: inOrder(c)
    visit(node)
    for c in children[half..]: inOrder(c)`,

  c: `${C_HEADER}
void inOrder(Node *n) {
    if (!n) return;
    int half = n->nk / 2;
    for (int i = 0; i < half; i++) inOrder(n->kids[i]);
    printf("%d ", n->v);
    for (int i = half; i < n->nk; i++) inOrder(n->kids[i]);
}

int main(void) {
    Node *root = build_sample();
    printf("In-order (N-ary): ");
    inOrder(root);
    printf("\\n");
    return 0;
}`,

  cpp: `${CPP_HEADER}
void inOrder(Node* n) {
    if (!n) return;
    size_t half = n->kids.size() / 2;
    for (size_t i = 0; i < half; ++i) inOrder(n->kids[i]);
    std::cout << n->v << ' ';
    for (size_t i = half; i < n->kids.size(); ++i) inOrder(n->kids[i]);
}

int main() {
    Node* root = build_sample();
    std::cout << "In-order (N-ary): ";
    inOrder(root);
    std::cout << "\\n";
    return 0;
}`,

  python: `${PY_HEADER}
def in_order(n, out):
    if n is None: return
    half = len(n.kids) // 2
    for c in n.kids[:half]: in_order(c, out)
    out.append(n.v)
    for c in n.kids[half:]: in_order(c, out)

if __name__ == "__main__":
    root = build_sample()
    out = []
    in_order(root, out)
    print("In-order (N-ary):", out)
`,

  java: `${JAVA_HEADER}
    static void inOrder(Node n, StringBuilder sb) {
        if (n == null) return;
        int half = n.kids.size() / 2;
        for (int i = 0; i < half; i++) inOrder(n.kids.get(i), sb);
        sb.append(n.v).append(" ");
        for (int i = half; i < n.kids.size(); i++) inOrder(n.kids.get(i), sb);
    }
    public static void main(String[] args) {
        Node root = buildSample();
        StringBuilder sb = new StringBuilder("In-order (N-ary): ");
        inOrder(root, sb);
        System.out.println(sb);
    }
}`,

  rust: `${RUST_HEADER}
fn in_order(n: &Node, out: &mut Vec<i32>) {
    let half = n.kids.len() / 2;
    for c in &n.kids[..half] { in_order(c, out); }
    out.push(n.v);
    for c in &n.kids[half..] { in_order(c, out); }
}

fn main() {
    let root = build_sample();
    let mut out = Vec::new();
    in_order(&root, &mut out);
    println!("In-order (N-ary): {:?}", out);
}`,
}

export const TREES_POST = {
  pseudo: `postOrder(node):
    for c in node.children:
        postOrder(c)
    visit(node)`,

  c: `${C_HEADER}
void postOrder(Node *n) {
    if (!n) return;
    for (int i = 0; i < n->nk; i++) postOrder(n->kids[i]);
    printf("%d ", n->v);
}

int main(void) {
    Node *root = build_sample();
    printf("Post-order: ");
    postOrder(root);
    printf("\\n");
    return 0;
}`,

  cpp: `${CPP_HEADER}
void postOrder(Node* n) {
    if (!n) return;
    for (Node* c : n->kids) postOrder(c);
    std::cout << n->v << ' ';
}

int main() {
    Node* root = build_sample();
    std::cout << "Post-order: ";
    postOrder(root);
    std::cout << "\\n";
    return 0;
}`,

  python: `${PY_HEADER}
def post_order(n, out):
    if n is None: return
    for c in n.kids: post_order(c, out)
    out.append(n.v)

if __name__ == "__main__":
    root = build_sample()
    out = []
    post_order(root, out)
    print("Post-order:", out)
`,

  java: `${JAVA_HEADER}
    static void postOrder(Node n, StringBuilder sb) {
        if (n == null) return;
        for (Node c : n.kids) postOrder(c, sb);
        sb.append(n.v).append(" ");
    }
    public static void main(String[] args) {
        Node root = buildSample();
        StringBuilder sb = new StringBuilder("Post-order: ");
        postOrder(root, sb);
        System.out.println(sb);
    }
}`,

  rust: `${RUST_HEADER}
fn post_order(n: &Node, out: &mut Vec<i32>) {
    for c in &n.kids { post_order(c, out); }
    out.push(n.v);
}

fn main() {
    let root = build_sample();
    let mut out = Vec::new();
    post_order(&root, &mut out);
    println!("Post-order: {:?}", out);
}`,
}

export const TREES_LEVEL = {
  pseudo: `levelOrder(root):
    queue = [root]
    while queue:
        n = queue.dequeue()
        visit(n)
        for c in n.children: queue.enqueue(c)`,

  c: `${C_HEADER}
void levelOrder(Node *root) {
    Node *q[256]; int h = 0, t = 0;
    q[t++] = root;
    while (h < t) {
        Node *n = q[h++];
        printf("%d ", n->v);
        for (int i = 0; i < n->nk; i++) q[t++] = n->kids[i];
    }
}

int main(void) {
    Node *root = build_sample();
    printf("Level-order: ");
    levelOrder(root);
    printf("\\n");
    return 0;
}`,

  cpp: `${CPP_HEADER}
void levelOrder(Node* root) {
    std::queue<Node*> q;
    q.push(root);
    while (!q.empty()) {
        Node* n = q.front(); q.pop();
        std::cout << n->v << ' ';
        for (Node* c : n->kids) q.push(c);
    }
}

int main() {
    Node* root = build_sample();
    std::cout << "Level-order: ";
    levelOrder(root);
    std::cout << "\\n";
    return 0;
}`,

  python: `${PY_HEADER}
def level_order(root):
    out = []
    q = deque([root])
    while q:
        n = q.popleft()
        out.append(n.v)
        for c in n.kids: q.append(c)
    return out

if __name__ == "__main__":
    root = build_sample()
    print("Level-order:", level_order(root))
`,

  java: `${JAVA_HEADER}
    static void levelOrder(Node root, StringBuilder sb) {
        Deque<Node> q = new ArrayDeque<>();
        q.offer(root);
        while (!q.isEmpty()) {
            Node n = q.poll();
            sb.append(n.v).append(" ");
            for (Node c : n.kids) q.offer(c);
        }
    }
    public static void main(String[] args) {
        Node root = buildSample();
        StringBuilder sb = new StringBuilder("Level-order: ");
        levelOrder(root, sb);
        System.out.println(sb);
    }
}`,

  rust: `${RUST_HEADER}
fn level_order(root: &Node) -> Vec<i32> {
    let mut out = Vec::new();
    let mut q: VecDeque<&Node> = VecDeque::new();
    q.push_back(root);
    while let Some(n) = q.pop_front() {
        out.push(n.v);
        for c in &n.kids { q.push_back(c); }
    }
    out
}

fn main() {
    let root = build_sample();
    println!("Level-order: {:?}", level_order(&root));
}`,
}

export const TREES_SAMPLES = [
  { name: '7-node tree', description: 'Sample N-ary tree with 3 branches',   stdin: '', expected: '' },
  { name: 'Single node', description: 'Trivial tree — one node only',        stdin: '', expected: '' },
]
