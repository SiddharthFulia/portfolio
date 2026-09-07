// Trees — N-ary traversals: pre / in (N-ary variant) / post / level order.
export const TREES_PRE = {
  pseudo: `preOrder(node):
    visit(node)
    for c in node.children:
        preOrder(c)`,

  c: `#include <stdio.h>
#define MAX_KIDS 8

typedef struct Node { int v; struct Node *kids[MAX_KIDS]; int nk; } Node;

void preOrder(Node *n) {
    if (!n) return;
    printf("%d ", n->v);                 // visit
    for (int i = 0; i < n->nk; i++)
        preOrder(n->kids[i]);
}`,

  cpp: `#include <vector>
#include <iostream>

struct Node { int v; std::vector<Node*> kids; };

void preOrder(Node* n) {
    if (!n) return;
    std::cout << n->v << ' ';           // visit
    for (Node* c : n->kids) preOrder(c);
}`,

  python: `class Node:
    def __init__(self, v):
        self.v = v
        self.kids: list["Node"] = []

def pre_order(n: Node | None) -> None:
    if n is None:
        return
    print(n.v, end=" ")           # visit
    for c in n.kids:
        pre_order(c)`,

  java: `import java.util.ArrayList;
import java.util.List;

class Node { int v; List<Node> kids = new ArrayList<>(); Node(int x){v=x;} }

static void preOrder(Node n) {
    if (n == null) return;
    System.out.print(n.v + " ");        // visit
    for (Node c : n.kids) preOrder(c);
}`,

  rust: `pub struct Node { pub v: i32, pub kids: Vec<Box<Node>> }

pub fn pre_order(n: &Node) {
    print!("{} ", n.v);                 // visit
    for c in &n.kids { pre_order(c); }
}`,
}

export const TREES_IN = {
  pseudo: `inOrder(node):     // N-ary variant
    half = children.length / 2
    for c in children[0..half]: inOrder(c)
    visit(node)
    for c in children[half..]: inOrder(c)`,

  c: `void inOrder(Node *n) {
    if (!n) return;
    int half = n->nk / 2;
    for (int i = 0; i < half; i++) inOrder(n->kids[i]);
    printf("%d ", n->v);                // visit
    for (int i = half; i < n->nk; i++) inOrder(n->kids[i]);
}`,

  cpp: `void inOrder(Node* n) {
    if (!n) return;
    size_t half = n->kids.size() / 2;
    for (size_t i = 0; i < half; ++i) inOrder(n->kids[i]);
    std::cout << n->v << ' ';           // visit
    for (size_t i = half; i < n->kids.size(); ++i) inOrder(n->kids[i]);
}`,

  python: `def in_order(n):
    if n is None:
        return
    half = len(n.kids) // 2
    for c in n.kids[:half]: in_order(c)
    print(n.v, end=" ")           # visit
    for c in n.kids[half:]: in_order(c)`,

  java: `static void inOrder(Node n) {
    if (n == null) return;
    int half = n.kids.size() / 2;
    for (int i = 0; i < half; i++) inOrder(n.kids.get(i));
    System.out.print(n.v + " ");        // visit
    for (int i = half; i < n.kids.size(); i++) inOrder(n.kids.get(i));
}`,

  rust: `pub fn in_order(n: &Node) {
    let half = n.kids.len() / 2;
    for c in &n.kids[..half] { in_order(c); }
    print!("{} ", n.v);                 // visit
    for c in &n.kids[half..] { in_order(c); }
}`,
}

export const TREES_POST = {
  pseudo: `postOrder(node):
    for c in node.children:
        postOrder(c)
    visit(node)`,

  c: `void postOrder(Node *n) {
    if (!n) return;
    for (int i = 0; i < n->nk; i++) postOrder(n->kids[i]);
    printf("%d ", n->v);                // visit last
}`,

  cpp: `void postOrder(Node* n) {
    if (!n) return;
    for (Node* c : n->kids) postOrder(c);
    std::cout << n->v << ' ';           // visit last
}`,

  python: `def post_order(n):
    if n is None:
        return
    for c in n.kids: post_order(c)
    print(n.v, end=" ")           # visit last`,

  java: `static void postOrder(Node n) {
    if (n == null) return;
    for (Node c : n.kids) postOrder(c);
    System.out.print(n.v + " ");        // visit last
}`,

  rust: `pub fn post_order(n: &Node) {
    for c in &n.kids { post_order(c); }
    print!("{} ", n.v);                 // visit last
}`,
}

export const TREES_LEVEL = {
  pseudo: `levelOrder(root):
    queue = [root]
    while queue:
        n = queue.dequeue()
        visit(n)
        for c in n.children: queue.enqueue(c)`,

  c: `#include <stdio.h>

void levelOrder(Node *root) {
    Node *q[256]; int h = 0, t = 0;
    q[t++] = root;
    while (h < t) {
        Node *n = q[h++];
        printf("%d ", n->v);            // visit
        for (int i = 0; i < n->nk; i++) q[t++] = n->kids[i];
    }
}`,

  cpp: `#include <queue>

void levelOrder(Node* root) {
    std::queue<Node*> q;
    q.push(root);
    while (!q.empty()) {
        Node* n = q.front(); q.pop();
        std::cout << n->v << ' ';       // visit
        for (Node* c : n->kids) q.push(c);
    }
}`,

  python: `from collections import deque

def level_order(root):
    q = deque([root])
    while q:
        n = q.popleft()
        print(n.v, end=" ")       # visit
        for c in n.kids:
            q.append(c)`,

  java: `import java.util.ArrayDeque;
import java.util.Deque;

static void levelOrder(Node root) {
    Deque<Node> q = new ArrayDeque<>();
    q.offer(root);
    while (!q.isEmpty()) {
        Node n = q.poll();
        System.out.print(n.v + " ");    // visit
        for (Node c : n.kids) q.offer(c);
    }
}`,

  rust: `use std::collections::VecDeque;

pub fn level_order(root: &Node) {
    let mut q: VecDeque<&Node> = VecDeque::new();
    q.push_back(root);
    while let Some(n) = q.pop_front() {
        print!("{} ", n.v);             // visit
        for c in &n.kids { q.push_back(c); }
    }
}`,
}
