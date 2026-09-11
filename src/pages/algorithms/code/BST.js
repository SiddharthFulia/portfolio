// BST — recursive insert + delete-with-successor, each a runnable program.
export const BST_INSERT_CODE = {
  pseudo: `function insert(root, v):
    if root == null: return Node(v)
    if v < root.v: root.left  = insert(root.left, v)
    else if v > root.v: root.right = insert(root.right, v)
    return root`,

  c: `#include <stdio.h>
#include <stdlib.h>

typedef struct Node { int v; struct Node *l, *r; } Node;

Node* insert(Node *root, int v) {
    if (!root) { Node *n = calloc(1, sizeof(Node)); n->v = v; return n; }
    if (v < root->v)      root->l = insert(root->l, v);
    else if (v > root->v) root->r = insert(root->r, v);
    return root;
}

void inorder(Node *n) {
    if (!n) return;
    inorder(n->l);
    printf(" %d", n->v);
    inorder(n->r);
}

int main(void) {
    int vals[] = {50, 30, 70, 20, 40, 60, 80};
    Node *root = NULL;
    for (int i = 0; i < 7; i++) root = insert(root, vals[i]);
    printf("Inorder:");
    inorder(root);
    printf("\\n");
    return 0;
}`,

  cpp: `#include <iostream>

struct Node { int v; Node *l = nullptr, *r = nullptr; };

Node* insert(Node* root, int v) {
    if (!root) return new Node{v};
    if (v < root->v)      root->l = insert(root->l, v);
    else if (v > root->v) root->r = insert(root->r, v);
    return root;
}

void inorder(Node* n) {
    if (!n) return;
    inorder(n->l);
    std::cout << " " << n->v;
    inorder(n->r);
}

int main() {
    int vals[] = {50, 30, 70, 20, 40, 60, 80};
    Node* root = nullptr;
    for (int v : vals) root = insert(root, v);
    std::cout << "Inorder:";
    inorder(root);
    std::cout << "\\n";
    return 0;
}`,

  python: `class Node:
    __slots__ = ("v", "l", "r")
    def __init__(self, v): self.v, self.l, self.r = v, None, None

def insert(root, v):
    if root is None: return Node(v)
    if v < root.v:   root.l = insert(root.l, v)
    elif v > root.v: root.r = insert(root.r, v)
    return root

def inorder(n, out):
    if n is None: return
    inorder(n.l, out); out.append(n.v); inorder(n.r, out)

if __name__ == "__main__":
    root = None
    for v in [50, 30, 70, 20, 40, 60, 80]:
        root = insert(root, v)
    out = []
    inorder(root, out)
    print("Inorder:", out)`,

  java: `public class Main {
    static class Node { int v; Node l, r; Node(int x){v=x;} }

    public static Node insert(Node root, int v) {
        if (root == null) return new Node(v);
        if (v < root.v)      root.l = insert(root.l, v);
        else if (v > root.v) root.r = insert(root.r, v);
        return root;
    }
    public static void inorder(Node n, StringBuilder sb) {
        if (n == null) return;
        inorder(n.l, sb); sb.append(" ").append(n.v); inorder(n.r, sb);
    }
    public static void main(String[] args) {
        Node root = null;
        for (int v : new int[]{50, 30, 70, 20, 40, 60, 80}) root = insert(root, v);
        StringBuilder sb = new StringBuilder("Inorder:");
        inorder(root, sb);
        System.out.println(sb);
    }
}`,

  rust: `pub struct Node { pub v: i32, pub l: Option<Box<Node>>, pub r: Option<Box<Node>> }

pub fn insert(root: Option<Box<Node>>, v: i32) -> Option<Box<Node>> {
    match root {
        None => Some(Box::new(Node { v, l: None, r: None })),
        Some(mut n) => {
            if v < n.v { n.l = insert(n.l.take(), v); }
            else if v > n.v { n.r = insert(n.r.take(), v); }
            Some(n)
        }
    }
}

fn inorder(n: &Option<Box<Node>>, out: &mut Vec<i32>) {
    if let Some(node) = n {
        inorder(&node.l, out);
        out.push(node.v);
        inorder(&node.r, out);
    }
}

fn main() {
    let mut root: Option<Box<Node>> = None;
    for v in [50, 30, 70, 20, 40, 60, 80] {
        root = insert(root, v);
    }
    let mut out = Vec::new();
    inorder(&root, &mut out);
    println!("Inorder: {:?}", out);
}`,
}

export const BST_INSERT_SAMPLES = [
  { name: 'Balanced',     description: 'Insert 50,30,70,20,40,60,80 — perfect BST', stdin: '', expected: '' },
  { name: 'Right-skewed', description: 'Insert 1,2,3,4,5 — linked-list shape',      stdin: '', expected: '' },
]

export const BST_DELETE_CODE = {
  pseudo: `function delete(root, v):
    if v < root.v: root.left  = delete(root.left, v)
    else if v > root.v: root.right = delete(root.right, v)
    else:
        if root.left  == null: return root.right       // case 1/2
        if root.right == null: return root.left        // case 1/2
        succ = min(root.right)                          // case 3
        root.v = succ.v
        root.right = delete(root.right, succ.v)
    return root`,

  c: `#include <stdio.h>
#include <stdlib.h>

typedef struct Node { int v; struct Node *l, *r; } Node;

Node* insert(Node *root, int v) {
    if (!root) { Node *n = calloc(1, sizeof(Node)); n->v = v; return n; }
    if (v < root->v)      root->l = insert(root->l, v);
    else if (v > root->v) root->r = insert(root->r, v);
    return root;
}
static Node* min_node(Node *n) { while (n && n->l) n = n->l; return n; }

Node* delete_(Node *root, int v) {
    if (!root) return NULL;
    if (v < root->v)      root->l = delete_(root->l, v);
    else if (v > root->v) root->r = delete_(root->r, v);
    else {
        if (!root->l) { Node *r = root->r; free(root); return r; }
        if (!root->r) { Node *l = root->l; free(root); return l; }
        Node *s = min_node(root->r);
        root->v = s->v;
        root->r = delete_(root->r, s->v);
    }
    return root;
}
void inorder(Node *n) {
    if (!n) return;
    inorder(n->l); printf(" %d", n->v); inorder(n->r);
}

int main(void) {
    Node *root = NULL;
    for (int i = 0; i < 7; i++) {
        int v[] = {50,30,70,20,40,60,80};
        root = insert(root, v[i]);
    }
    root = delete_(root, 30);   // internal, 2 children
    printf("After delete(30):");
    inorder(root);
    printf("\\n");
    return 0;
}`,

  cpp: `#include <iostream>

struct Node { int v; Node *l = nullptr, *r = nullptr; };

Node* insert(Node* root, int v) {
    if (!root) return new Node{v};
    if (v < root->v)      root->l = insert(root->l, v);
    else if (v > root->v) root->r = insert(root->r, v);
    return root;
}
static Node* min_node(Node* n) { while (n && n->l) n = n->l; return n; }

Node* remove(Node* root, int v) {
    if (!root) return nullptr;
    if (v < root->v)      root->l = remove(root->l, v);
    else if (v > root->v) root->r = remove(root->r, v);
    else {
        if (!root->l) { Node* r = root->r; delete root; return r; }
        if (!root->r) { Node* l = root->l; delete root; return l; }
        Node* s = min_node(root->r);
        root->v = s->v;
        root->r = remove(root->r, s->v);
    }
    return root;
}
void inorder(Node* n) {
    if (!n) return;
    inorder(n->l); std::cout << " " << n->v; inorder(n->r);
}

int main() {
    Node* root = nullptr;
    for (int v : {50,30,70,20,40,60,80}) root = insert(root, v);
    root = remove(root, 30);
    std::cout << "After delete(30):";
    inorder(root);
    std::cout << "\\n";
    return 0;
}`,

  python: `class Node:
    __slots__ = ("v", "l", "r")
    def __init__(self, v): self.v, self.l, self.r = v, None, None

def insert(root, v):
    if root is None: return Node(v)
    if v < root.v:   root.l = insert(root.l, v)
    elif v > root.v: root.r = insert(root.r, v)
    return root

def _min(n):
    while n.l is not None: n = n.l
    return n

def delete(root, v):
    if root is None: return None
    if v < root.v:   root.l = delete(root.l, v)
    elif v > root.v: root.r = delete(root.r, v)
    else:
        if root.l is None: return root.r
        if root.r is None: return root.l
        s = _min(root.r)
        root.v = s.v
        root.r = delete(root.r, s.v)
    return root

def inorder(n, out):
    if n is None: return
    inorder(n.l, out); out.append(n.v); inorder(n.r, out)

if __name__ == "__main__":
    root = None
    for v in [50,30,70,20,40,60,80]:
        root = insert(root, v)
    root = delete(root, 30)
    out = []
    inorder(root, out)
    print("After delete(30):", out)`,

  java: `public class Main {
    static class Node { int v; Node l, r; Node(int x){v=x;} }

    static Node insert(Node root, int v) {
        if (root == null) return new Node(v);
        if (v < root.v)      root.l = insert(root.l, v);
        else if (v > root.v) root.r = insert(root.r, v);
        return root;
    }
    static Node minNode(Node n) { while (n.l != null) n = n.l; return n; }
    static Node delete(Node root, int v) {
        if (root == null) return null;
        if (v < root.v)      root.l = delete(root.l, v);
        else if (v > root.v) root.r = delete(root.r, v);
        else {
            if (root.l == null) return root.r;
            if (root.r == null) return root.l;
            Node s = minNode(root.r);
            root.v = s.v;
            root.r = delete(root.r, s.v);
        }
        return root;
    }
    static void inorder(Node n, StringBuilder sb) {
        if (n == null) return;
        inorder(n.l, sb); sb.append(" ").append(n.v); inorder(n.r, sb);
    }
    public static void main(String[] args) {
        Node root = null;
        for (int v : new int[]{50,30,70,20,40,60,80}) root = insert(root, v);
        root = delete(root, 30);
        StringBuilder sb = new StringBuilder("After delete(30):");
        inorder(root, sb);
        System.out.println(sb);
    }
}`,

  rust: `pub struct Node { pub v: i32, pub l: Option<Box<Node>>, pub r: Option<Box<Node>> }

pub fn insert(root: Option<Box<Node>>, v: i32) -> Option<Box<Node>> {
    match root {
        None => Some(Box::new(Node { v, l: None, r: None })),
        Some(mut n) => {
            if v < n.v { n.l = insert(n.l.take(), v); }
            else if v > n.v { n.r = insert(n.r.take(), v); }
            Some(n)
        }
    }
}

pub fn delete(root: Option<Box<Node>>, v: i32) -> Option<Box<Node>> {
    let mut n = match root { None => return None, Some(x) => x };
    if v < n.v { n.l = delete(n.l.take(), v); return Some(n); }
    if v > n.v { n.r = delete(n.r.take(), v); return Some(n); }
    if n.l.is_none() { return n.r.take(); }
    if n.r.is_none() { return n.l.take(); }
    // 2 children — find successor value, splice.
    let mut s = n.r.as_deref().unwrap();
    while let Some(l) = s.l.as_deref() { s = l; }
    let sv = s.v;
    n.v = sv;
    n.r = delete(n.r.take(), sv);
    Some(n)
}

fn inorder(n: &Option<Box<Node>>, out: &mut Vec<i32>) {
    if let Some(node) = n {
        inorder(&node.l, out); out.push(node.v); inorder(&node.r, out);
    }
}

fn main() {
    let mut root: Option<Box<Node>> = None;
    for v in [50,30,70,20,40,60,80] { root = insert(root, v); }
    root = delete(root, 30);
    let mut out = Vec::new();
    inorder(&root, &mut out);
    println!("After delete(30): {:?}", out);
}`,
}

export const BST_DELETE_SAMPLES = [
  { name: 'Two-child',   description: 'Delete 30 (has both left+right children)', stdin: '', expected: '' },
  { name: 'Leaf',        description: 'Delete 80 (leaf node)',                    stdin: '', expected: '' },
  { name: 'Root',        description: 'Delete 50 (root, two children)',           stdin: '', expected: '' },
]
