// BST — recursive insert + delete-with-successor.
export const BST_INSERT_CODE = {
  pseudo: `function insert(root, v):
    if root == null: return Node(v)
    if v < root.v: root.left  = insert(root.left, v)
    else if v > root.v: root.right = insert(root.right, v)
    return root`,

  c: `#include <stdlib.h>

typedef struct Node { int v; struct Node *l, *r; } Node;

Node* insert(Node *root, int v) {
    if (!root) { Node *n = calloc(1, sizeof(Node)); n->v = v; return n; }
    if (v < root->v)      root->l = insert(root->l, v);
    else if (v > root->v) root->r = insert(root->r, v);
    return root;                                // duplicates ignored
}`,

  cpp: `struct Node { int v; Node *l = nullptr, *r = nullptr; };

Node* insert(Node* root, int v) {
    if (!root) return new Node{v};
    if (v < root->v)      root->l = insert(root->l, v);
    else if (v > root->v) root->r = insert(root->r, v);
    return root;                                // duplicates ignored
}`,

  python: `class Node:
    __slots__ = ("v", "l", "r")
    def __init__(self, v): self.v, self.l, self.r = v, None, None

def insert(root, v):
    if root is None:
        return Node(v)
    if v < root.v:
        root.l = insert(root.l, v)
    elif v > root.v:
        root.r = insert(root.r, v)
    return root                                 # duplicates ignored`,

  java: `class Node { int v; Node l, r; Node(int x){v=x;} }

public static Node insert(Node root, int v) {
    if (root == null) return new Node(v);
    if (v < root.v)      root.l = insert(root.l, v);
    else if (v > root.v) root.r = insert(root.r, v);
    return root;                                // duplicates ignored
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
}`,
}

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

  c: `static Node* min_node(Node *n) { while (n && n->l) n = n->l; return n; }

Node* delete_(Node *root, int v) {
    if (!root) return NULL;
    if (v < root->v)      root->l = delete_(root->l, v);
    else if (v > root->v) root->r = delete_(root->r, v);
    else {
        if (!root->l) { Node *r = root->r; free(root); return r; }
        if (!root->r) { Node *l = root->l; free(root); return l; }
        Node *s = min_node(root->r);                    // case 3
        root->v = s->v;
        root->r = delete_(root->r, s->v);
    }
    return root;
}`,

  cpp: `static Node* min_node(Node* n) { while (n && n->l) n = n->l; return n; }

Node* remove(Node* root, int v) {
    if (!root) return nullptr;
    if (v < root->v)      root->l = remove(root->l, v);
    else if (v > root->v) root->r = remove(root->r, v);
    else {
        if (!root->l) { Node* r = root->r; delete root; return r; }
        if (!root->r) { Node* l = root->l; delete root; return l; }
        Node* s = min_node(root->r);                    // case 3
        root->v = s->v;
        root->r = remove(root->r, s->v);
    }
    return root;
}`,

  python: `def _min(n):
    while n.l is not None:
        n = n.l
    return n

def delete(root, v):
    if root is None:
        return None
    if v < root.v:
        root.l = delete(root.l, v)
    elif v > root.v:
        root.r = delete(root.r, v)
    else:
        if root.l is None: return root.r                # case 1/2
        if root.r is None: return root.l                # case 1/2
        s = _min(root.r)                                # case 3
        root.v = s.v
        root.r = delete(root.r, s.v)
    return root`,

  java: `private static Node minNode(Node n) { while (n.l != null) n = n.l; return n; }

public static Node delete(Node root, int v) {
    if (root == null) return null;
    if (v < root.v)      root.l = delete(root.l, v);
    else if (v > root.v) root.r = delete(root.r, v);
    else {
        if (root.l == null) return root.r;              // case 1/2
        if (root.r == null) return root.l;              // case 1/2
        Node s = minNode(root.r);                       // case 3
        root.v = s.v;
        root.r = delete(root.r, s.v);
    }
    return root;
}`,

  rust: `pub fn delete(root: Option<Box<Node>>, v: i32) -> Option<Box<Node>> {
    let mut n = match root { None => return None, Some(x) => x };
    if v < n.v { n.l = delete(n.l.take(), v); Some(n) }
    else if v > n.v { n.r = delete(n.r.take(), v); Some(n) }
    else {
        // 0 or 1 child — splice the other in.
        if n.l.is_none() { return n.r.take(); }
        if n.r.is_none() { return n.l.take(); }
        // 2 children — copy successor's value up, delete successor.
        let mut s = n.r.as_deref().unwrap();
        while let Some(l) = s.l.as_deref() { s = l; }
        let sv = s.v;
        n.v = sv;
        n.r = delete(n.r.take(), sv);
        Some(n)
    }
}`,
}
