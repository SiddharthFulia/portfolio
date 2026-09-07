// SegmentTrees — recursive range query + point update (sum variant).
export const SEG_QUERY_CODE = {
  pseudo: `function query(node, lo, hi, ql, qh):
    if qh < lo or hi < ql:
        return identity          // disjoint
    if ql <= lo and hi <= qh:
        return seg[node]         // fully inside
    mid = (lo + hi) / 2
    L = query(node*2, lo, mid, ql, qh)
    R = query(node*2+1, mid+1, hi, ql, qh)
    return combine(L, R)`,

  c: `int seg[4 * MAX_N];   // 4n is the safe upper bound

int query(int node, int lo, int hi, int ql, int qh) {
    if (qh < lo || hi < ql) return 0;              // disjoint (identity=0 for sum)
    if (ql <= lo && hi <= qh) return seg[node];    // fully inside
    int mid = (lo + hi) / 2;
    int L = query(node*2,     lo,      mid, ql, qh);
    int R = query(node*2 + 1, mid + 1, hi,  ql, qh);
    return L + R;                                   // combine
}`,

  cpp: `#include <vector>

std::vector<int> seg;    // sized 4 * n on build

int query(int node, int lo, int hi, int ql, int qh) {
    if (qh < lo || hi < ql) return 0;              // disjoint
    if (ql <= lo && hi <= qh) return seg[node];    // fully inside
    int mid = (lo + hi) / 2;
    int L = query(node*2,     lo,      mid, ql, qh);
    int R = query(node*2 + 1, mid + 1, hi,  ql, qh);
    return L + R;                                   // combine
}`,

  python: `class SegTree:
    def __init__(self, n: int):
        self.n = n
        self.seg = [0] * (4 * n)

    def query(self, node: int, lo: int, hi: int, ql: int, qh: int) -> int:
        if qh < lo or hi < ql:
            return 0                                    # disjoint
        if ql <= lo and hi <= qh:
            return self.seg[node]                       # fully inside
        mid = (lo + hi) // 2
        L = self.query(node * 2,     lo,      mid, ql, qh)
        R = self.query(node * 2 + 1, mid + 1, hi,  ql, qh)
        return L + R                                    # combine`,

  java: `public class SegTree {
    int[] seg;
    int   n;
    SegTree(int n) { this.n = n; seg = new int[4 * n]; }

    int query(int node, int lo, int hi, int ql, int qh) {
        if (qh < lo || hi < ql) return 0;              // disjoint
        if (ql <= lo && hi <= qh) return seg[node];    // fully inside
        int mid = (lo + hi) / 2;
        int L = query(node * 2,     lo,      mid, ql, qh);
        int R = query(node * 2 + 1, mid + 1, hi,  ql, qh);
        return L + R;                                   // combine
    }
}`,

  rust: `pub struct SegTree { pub seg: Vec<i64>, pub n: usize }

impl SegTree {
    pub fn new(n: usize) -> Self { Self { seg: vec![0; 4 * n], n } }

    pub fn query(&self, node: usize, lo: usize, hi: usize, ql: usize, qh: usize) -> i64 {
        if qh < lo || hi < ql { return 0; }                       // disjoint
        if ql <= lo && hi <= qh { return self.seg[node]; }         // fully inside
        let mid = (lo + hi) / 2;
        let l = self.query(node * 2,     lo,      mid, ql, qh);
        let r = self.query(node * 2 + 1, mid + 1, hi,  ql, qh);
        l + r                                                       // combine
    }
}`,
}

export const SEG_UPDATE_CODE = {
  pseudo: `function update(node, lo, hi, idx, val):
    if lo == hi:
        seg[node] = val
        return
    mid = (lo + hi) / 2
    if idx <= mid: update(node*2, lo, mid, idx, val)
    else:          update(node*2+1, mid+1, hi, idx, val)
    seg[node] = combine(seg[node*2], seg[node*2+1])`,

  c: `void update(int node, int lo, int hi, int idx, int val) {
    if (lo == hi) { seg[node] = val; return; }
    int mid = (lo + hi) / 2;
    if (idx <= mid) update(node*2,     lo,      mid, idx, val);
    else            update(node*2 + 1, mid + 1, hi,  idx, val);
    seg[node] = seg[node*2] + seg[node*2 + 1];        // recombine
}`,

  cpp: `void update(int node, int lo, int hi, int idx, int val) {
    if (lo == hi) { seg[node] = val; return; }
    int mid = (lo + hi) / 2;
    if (idx <= mid) update(node*2,     lo,      mid, idx, val);
    else            update(node*2 + 1, mid + 1, hi,  idx, val);
    seg[node] = seg[node*2] + seg[node*2 + 1];        // recombine
}`,

  python: `def update(self, node: int, lo: int, hi: int, idx: int, val: int) -> None:
    if lo == hi:
        self.seg[node] = val
        return
    mid = (lo + hi) // 2
    if idx <= mid:
        self.update(node * 2, lo, mid, idx, val)
    else:
        self.update(node * 2 + 1, mid + 1, hi, idx, val)
    self.seg[node] = self.seg[node * 2] + self.seg[node * 2 + 1]`,

  java: `void update(int node, int lo, int hi, int idx, int val) {
    if (lo == hi) { seg[node] = val; return; }
    int mid = (lo + hi) / 2;
    if (idx <= mid) update(node * 2,     lo,      mid, idx, val);
    else            update(node * 2 + 1, mid + 1, hi,  idx, val);
    seg[node] = seg[node * 2] + seg[node * 2 + 1];    // recombine
}`,

  rust: `pub fn update(&mut self, node: usize, lo: usize, hi: usize, idx: usize, val: i64) {
    if lo == hi { self.seg[node] = val; return; }
    let mid = (lo + hi) / 2;
    if idx <= mid { self.update(node * 2,     lo,      mid, idx, val); }
    else          { self.update(node * 2 + 1, mid + 1, hi,  idx, val); }
    self.seg[node] = self.seg[node * 2] + self.seg[node * 2 + 1];   // recombine
}`,
}
