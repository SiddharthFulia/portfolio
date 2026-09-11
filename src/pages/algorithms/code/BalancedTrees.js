// BalancedTrees — AVL insert with left/right rotations.
export const AVL_CODE = {
  pseudo: `function insert(n, v):
    if n == null: return Node(v)
    if v < n.v: n.left  = insert(n.left,  v)
    else if v > n.v: n.right = insert(n.right, v)
    else: return n
    updateHeight(n)
    bf = h(n.left) - h(n.right)
    if bf > 1 and v < n.left.v:  return rotR(n)          // LL
    if bf < -1 and v > n.right.v: return rotL(n)          // RR
    if bf > 1 and v > n.left.v:  n.left  = rotL(n.left);  return rotR(n)   // LR
    if bf < -1 and v < n.right.v: n.right = rotR(n.right); return rotL(n)   // RL
    return n`,

  c: `#include <stdio.h>
#include <stdlib.h>

typedef struct Node { int v, h; struct Node *l, *r; } Node;

static int H(Node *n) { return n ? n->h : 0; }
static int max_(int a, int b) { return a > b ? a : b; }
static void upd(Node *n) { n->h = 1 + max_(H(n->l), H(n->r)); }
static Node* rotR(Node *y) { Node *x = y->l; y->l = x->r; x->r = y; upd(y); upd(x); return x; }
static Node* rotL(Node *x) { Node *y = x->r; x->r = y->l; y->l = x; upd(x); upd(y); return y; }

Node* avl_insert(Node *n, int v) {
    if (!n) { Node *z = calloc(1, sizeof(Node)); z->v = v; z->h = 1; return z; }
    if (v < n->v)      n->l = avl_insert(n->l, v);
    else if (v > n->v) n->r = avl_insert(n->r, v);
    else return n;
    upd(n);
    int bf = H(n->l) - H(n->r);
    if (bf >  1 && v < n->l->v)  return rotR(n);
    if (bf < -1 && v > n->r->v)  return rotL(n);
    if (bf >  1 && v > n->l->v){ n->l = rotL(n->l); return rotR(n);}
    if (bf < -1 && v < n->r->v){ n->r = rotR(n->r); return rotL(n);}
    return n;
}
void inorder(Node *n) {
    if (!n) return;
    inorder(n->l); printf(" %d(h%d)", n->v, n->h); inorder(n->r);
}

int main(void) {
    Node *root = NULL;
    int vals[] = {10, 20, 30, 40, 50, 25};
    for (int i = 0; i < 6; i++) root = avl_insert(root, vals[i]);
    printf("Inorder (val,h):"); inorder(root); printf("\\n");
    printf("Root value = %d (should be balanced, e.g. 30)\\n", root->v);
    return 0;
}`,

  cpp: `#include <iostream>
#include <algorithm>

struct Node { int v, h = 1; Node *l = nullptr, *r = nullptr; };

int H(Node* n)  { return n ? n->h : 0; }
void upd(Node* n) { n->h = 1 + std::max(H(n->l), H(n->r)); }
Node* rotR(Node* y) { Node* x = y->l; y->l = x->r; x->r = y; upd(y); upd(x); return x; }
Node* rotL(Node* x) { Node* y = x->r; x->r = y->l; y->l = x; upd(x); upd(y); return y; }

Node* avl_insert(Node* n, int v) {
    if (!n) return new Node{v};
    if (v < n->v)      n->l = avl_insert(n->l, v);
    else if (v > n->v) n->r = avl_insert(n->r, v);
    else return n;
    upd(n);
    int bf = H(n->l) - H(n->r);
    if (bf >  1 && v < n->l->v)   return rotR(n);
    if (bf < -1 && v > n->r->v)   return rotL(n);
    if (bf >  1 && v > n->l->v) { n->l = rotL(n->l); return rotR(n);}
    if (bf < -1 && v < n->r->v) { n->r = rotR(n->r); return rotL(n);}
    return n;
}
void inorder(Node* n) {
    if (!n) return;
    inorder(n->l); std::cout << " " << n->v << "(h" << n->h << ")"; inorder(n->r);
}

int main() {
    Node* root = nullptr;
    for (int v : {10, 20, 30, 40, 50, 25}) root = avl_insert(root, v);
    std::cout << "Inorder (val,h):"; inorder(root); std::cout << "\\n";
    std::cout << "Root value = " << root->v << "\\n";
    return 0;
}`,

  python: `class Node:
    __slots__ = ("v", "h", "l", "r")
    def __init__(self, v):
        self.v, self.h, self.l, self.r = v, 1, None, None

def _h(n):   return n.h if n else 0
def _upd(n): n.h = 1 + max(_h(n.l), _h(n.r))

def _rot_r(y):
    x = y.l; y.l = x.r; x.r = y; _upd(y); _upd(x); return x
def _rot_l(x):
    y = x.r; x.r = y.l; y.l = x; _upd(x); _upd(y); return y

def avl_insert(n, v):
    if n is None: return Node(v)
    if v < n.v:   n.l = avl_insert(n.l, v)
    elif v > n.v: n.r = avl_insert(n.r, v)
    else:         return n
    _upd(n)
    bf = _h(n.l) - _h(n.r)
    if bf >  1 and v < n.l.v:   return _rot_r(n)
    if bf < -1 and v > n.r.v:   return _rot_l(n)
    if bf >  1 and v > n.l.v:   n.l = _rot_l(n.l); return _rot_r(n)
    if bf < -1 and v < n.r.v:   n.r = _rot_r(n.r); return _rot_l(n)
    return n

def inorder(n, out):
    if n is None: return
    inorder(n.l, out); out.append((n.v, n.h)); inorder(n.r, out)

if __name__ == "__main__":
    root = None
    for v in [10, 20, 30, 40, 50, 25]:
        root = avl_insert(root, v)
    out = []
    inorder(root, out)
    print("Inorder (val,h):", out)
    print("Root value =", root.v)`,

  java: `public class Main {
    static class Node { int v, h = 1; Node l, r; Node(int x){v=x;} }

    static int H(Node n) { return n == null ? 0 : n.h; }
    static void upd(Node n) { n.h = 1 + Math.max(H(n.l), H(n.r)); }
    static Node rotR(Node y) { Node x = y.l; y.l = x.r; x.r = y; upd(y); upd(x); return x; }
    static Node rotL(Node x) { Node y = x.r; x.r = y.l; y.l = x; upd(x); upd(y); return y; }

    static Node insert(Node n, int v) {
        if (n == null) return new Node(v);
        if (v < n.v)      n.l = insert(n.l, v);
        else if (v > n.v) n.r = insert(n.r, v);
        else return n;
        upd(n);
        int bf = H(n.l) - H(n.r);
        if (bf >  1 && v < n.l.v)   return rotR(n);
        if (bf < -1 && v > n.r.v)   return rotL(n);
        if (bf >  1 && v > n.l.v) { n.l = rotL(n.l); return rotR(n); }
        if (bf < -1 && v < n.r.v) { n.r = rotR(n.r); return rotL(n); }
        return n;
    }
    static void inorder(Node n, StringBuilder sb) {
        if (n == null) return;
        inorder(n.l, sb); sb.append(" ").append(n.v).append("(h").append(n.h).append(")"); inorder(n.r, sb);
    }
    public static void main(String[] args) {
        Node root = null;
        for (int v : new int[]{10, 20, 30, 40, 50, 25}) root = insert(root, v);
        StringBuilder sb = new StringBuilder("Inorder (val,h):");
        inorder(root, sb);
        System.out.println(sb);
        System.out.println("Root value = " + root.v);
    }
}`,

  rust: `struct Node { v: i32, h: i32, l: Option<Box<Node>>, r: Option<Box<Node>> }

fn h(n: &Option<Box<Node>>) -> i32 { n.as_ref().map_or(0, |x| x.h) }
fn upd(n: &mut Node) { n.h = 1 + h(&n.l).max(h(&n.r)); }
fn rot_r(mut y: Box<Node>) -> Box<Node> {
    let mut x = y.l.take().unwrap();
    y.l = x.r.take();
    upd(&mut y); x.r = Some(y); upd(&mut x); x
}
fn rot_l(mut x: Box<Node>) -> Box<Node> {
    let mut y = x.r.take().unwrap();
    x.r = y.l.take();
    upd(&mut x); y.l = Some(x); upd(&mut y); y
}

fn insert(root: Option<Box<Node>>, v: i32) -> Option<Box<Node>> {
    let mut n = match root {
        None => return Some(Box::new(Node { v, h: 1, l: None, r: None })),
        Some(x) => x,
    };
    if v < n.v { n.l = insert(n.l.take(), v); }
    else if v > n.v { n.r = insert(n.r.take(), v); }
    else { return Some(n); }
    upd(&mut n);
    let bf = h(&n.l) - h(&n.r);
    let lv = n.l.as_deref().map(|x| x.v);
    let rv = n.r.as_deref().map(|x| x.v);
    if bf >  1 && lv.map_or(false, |x| v < x) { return Some(rot_r(n)); }
    if bf < -1 && rv.map_or(false, |x| v > x) { return Some(rot_l(n)); }
    if bf >  1 && lv.map_or(false, |x| v > x) {
        n.l = Some(rot_l(n.l.take().unwrap())); return Some(rot_r(n));
    }
    if bf < -1 && rv.map_or(false, |x| v < x) {
        n.r = Some(rot_r(n.r.take().unwrap())); return Some(rot_l(n));
    }
    Some(n)
}

fn inorder(n: &Option<Box<Node>>, out: &mut Vec<(i32, i32)>) {
    if let Some(node) = n {
        inorder(&node.l, out);
        out.push((node.v, node.h));
        inorder(&node.r, out);
    }
}

fn main() {
    let mut root: Option<Box<Node>> = None;
    for v in [10, 20, 30, 40, 50, 25] { root = insert(root, v); }
    let mut out = Vec::new();
    inorder(&root, &mut out);
    println!("Inorder (val,h): {:?}", out);
    println!("Root value = {}", root.as_ref().unwrap().v);
}`,
}

export const AVL_SAMPLES = [
  { name: 'RR rotation', description: 'Insert 10,20,30 — right-heavy → left-rotate', stdin: '', expected: '' },
  { name: 'Balanced 6',  description: '10,20,30,40,50,25 — mixed rotations',         stdin: '', expected: '' },
]
