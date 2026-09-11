// SegmentTrees — full runnable programs demonstrating query + update.
export const SEG_QUERY_CODE = {
  pseudo: `function query(node, lo, hi, ql, qh):
    if qh < lo or hi < ql:
        return identity
    if ql <= lo and hi <= qh:
        return seg[node]
    mid = (lo + hi) / 2
    L = query(node*2, lo, mid, ql, qh)
    R = query(node*2+1, mid+1, hi, ql, qh)
    return combine(L, R)`,

  c: `#include <stdio.h>
#define MAX_N 16
int seg[4 * MAX_N];

void build(int a[], int node, int lo, int hi) {
    if (lo == hi) { seg[node] = a[lo]; return; }
    int mid = (lo + hi) / 2;
    build(a, node*2, lo, mid);
    build(a, node*2 + 1, mid + 1, hi);
    seg[node] = seg[node*2] + seg[node*2 + 1];
}

int query(int node, int lo, int hi, int ql, int qh) {
    if (qh < lo || hi < ql) return 0;
    if (ql <= lo && hi <= qh) return seg[node];
    int mid = (lo + hi) / 2;
    return query(node*2, lo, mid, ql, qh) + query(node*2 + 1, mid + 1, hi, ql, qh);
}

int main(void) {
    int a[] = {1, 3, 5, 7, 9, 11}; int n = 6;
    build(a, 1, 0, n - 1);
    printf("sum(0..5) = %d\\n", query(1, 0, n - 1, 0, 5));  // 36
    printf("sum(1..3) = %d\\n", query(1, 0, n - 1, 1, 3));  // 15
    printf("sum(2..2) = %d\\n", query(1, 0, n - 1, 2, 2));  // 5
    return 0;
}`,

  cpp: `#include <iostream>
#include <vector>

struct SegTree {
    std::vector<int> seg;
    int n;
    SegTree(const std::vector<int>& a) : n(a.size()), seg(4 * a.size(), 0) {
        build(a, 1, 0, n - 1);
    }
    void build(const std::vector<int>& a, int node, int lo, int hi) {
        if (lo == hi) { seg[node] = a[lo]; return; }
        int mid = (lo + hi) / 2;
        build(a, node*2, lo, mid); build(a, node*2+1, mid+1, hi);
        seg[node] = seg[node*2] + seg[node*2+1];
    }
    int query(int node, int lo, int hi, int ql, int qh) {
        if (qh < lo || hi < ql) return 0;
        if (ql <= lo && hi <= qh) return seg[node];
        int mid = (lo + hi) / 2;
        return query(node*2, lo, mid, ql, qh) + query(node*2+1, mid+1, hi, ql, qh);
    }
};

int main() {
    std::vector<int> a = {1, 3, 5, 7, 9, 11};
    SegTree t(a);
    std::cout << "sum(0..5) = " << t.query(1, 0, 5, 0, 5) << "\\n";
    std::cout << "sum(1..3) = " << t.query(1, 0, 5, 1, 3) << "\\n";
    std::cout << "sum(2..2) = " << t.query(1, 0, 5, 2, 2) << "\\n";
    return 0;
}`,

  python: `class SegTree:
    def __init__(self, a):
        self.n = len(a)
        self.seg = [0] * (4 * self.n)
        self._build(a, 1, 0, self.n - 1)

    def _build(self, a, node, lo, hi):
        if lo == hi: self.seg[node] = a[lo]; return
        mid = (lo + hi) // 2
        self._build(a, node*2, lo, mid); self._build(a, node*2+1, mid+1, hi)
        self.seg[node] = self.seg[node*2] + self.seg[node*2+1]

    def query(self, node, lo, hi, ql, qh):
        if qh < lo or hi < ql: return 0
        if ql <= lo and hi <= qh: return self.seg[node]
        mid = (lo + hi) // 2
        return self.query(node*2, lo, mid, ql, qh) + self.query(node*2+1, mid+1, hi, ql, qh)

if __name__ == "__main__":
    t = SegTree([1, 3, 5, 7, 9, 11])
    print("sum(0..5) =", t.query(1, 0, 5, 0, 5))
    print("sum(1..3) =", t.query(1, 0, 5, 1, 3))
    print("sum(2..2) =", t.query(1, 0, 5, 2, 2))`,

  java: `public class Main {
    static int[] seg;
    static int n;

    static void build(int[] a, int node, int lo, int hi) {
        if (lo == hi) { seg[node] = a[lo]; return; }
        int mid = (lo + hi) / 2;
        build(a, node*2, lo, mid); build(a, node*2+1, mid+1, hi);
        seg[node] = seg[node*2] + seg[node*2+1];
    }

    static int query(int node, int lo, int hi, int ql, int qh) {
        if (qh < lo || hi < ql) return 0;
        if (ql <= lo && hi <= qh) return seg[node];
        int mid = (lo + hi) / 2;
        return query(node*2, lo, mid, ql, qh) + query(node*2+1, mid+1, hi, ql, qh);
    }

    public static void main(String[] args) {
        int[] a = {1, 3, 5, 7, 9, 11};
        n = a.length; seg = new int[4 * n];
        build(a, 1, 0, n - 1);
        System.out.println("sum(0..5) = " + query(1, 0, 5, 0, 5));
        System.out.println("sum(1..3) = " + query(1, 0, 5, 1, 3));
        System.out.println("sum(2..2) = " + query(1, 0, 5, 2, 2));
    }
}`,

  rust: `struct SegTree { seg: Vec<i64>, n: usize }

impl SegTree {
    fn new(a: &[i64]) -> Self {
        let n = a.len();
        let mut t = SegTree { seg: vec![0; 4 * n], n };
        t.build(a, 1, 0, n - 1);
        t
    }
    fn build(&mut self, a: &[i64], node: usize, lo: usize, hi: usize) {
        if lo == hi { self.seg[node] = a[lo]; return; }
        let mid = (lo + hi) / 2;
        self.build(a, node*2, lo, mid);
        self.build(a, node*2 + 1, mid + 1, hi);
        self.seg[node] = self.seg[node*2] + self.seg[node*2 + 1];
    }
    fn query(&self, node: usize, lo: usize, hi: usize, ql: usize, qh: usize) -> i64 {
        if qh < lo || hi < ql { return 0; }
        if ql <= lo && hi <= qh { return self.seg[node]; }
        let mid = (lo + hi) / 2;
        self.query(node*2, lo, mid, ql, qh) + self.query(node*2 + 1, mid + 1, hi, ql, qh)
    }
}

fn main() {
    let a = [1i64, 3, 5, 7, 9, 11];
    let t = SegTree::new(&a);
    println!("sum(0..5) = {}", t.query(1, 0, 5, 0, 5));
    println!("sum(1..3) = {}", t.query(1, 0, 5, 1, 3));
    println!("sum(2..2) = {}", t.query(1, 0, 5, 2, 2));
}`,
}

export const SEG_QUERY_SAMPLES = [
  { name: 'Full range', description: 'Sum of entire array [1,3,5,7,9,11]',    stdin: '', expected: '' },
  { name: 'Middle',     description: 'Sum of [1..3] = 3+5+7',                 stdin: '', expected: '' },
  { name: 'Point',      description: 'Single-element query [2..2]',           stdin: '', expected: '' },
]

export const SEG_UPDATE_CODE = {
  pseudo: `function update(node, lo, hi, idx, val):
    if lo == hi:
        seg[node] = val
        return
    mid = (lo + hi) / 2
    if idx <= mid: update(node*2, lo, mid, idx, val)
    else:          update(node*2+1, mid+1, hi, idx, val)
    seg[node] = combine(seg[node*2], seg[node*2+1])`,

  c: `#include <stdio.h>
#define MAX_N 16
int seg[4 * MAX_N];

void build(int a[], int node, int lo, int hi) {
    if (lo == hi) { seg[node] = a[lo]; return; }
    int mid = (lo + hi) / 2;
    build(a, node*2, lo, mid); build(a, node*2 + 1, mid + 1, hi);
    seg[node] = seg[node*2] + seg[node*2 + 1];
}
void update(int node, int lo, int hi, int idx, int val) {
    if (lo == hi) { seg[node] = val; return; }
    int mid = (lo + hi) / 2;
    if (idx <= mid) update(node*2, lo, mid, idx, val);
    else            update(node*2 + 1, mid + 1, hi, idx, val);
    seg[node] = seg[node*2] + seg[node*2 + 1];
}
int query(int node, int lo, int hi, int ql, int qh) {
    if (qh < lo || hi < ql) return 0;
    if (ql <= lo && hi <= qh) return seg[node];
    int mid = (lo + hi) / 2;
    return query(node*2, lo, mid, ql, qh) + query(node*2 + 1, mid + 1, hi, ql, qh);
}

int main(void) {
    int a[] = {1, 3, 5, 7, 9, 11}; int n = 6;
    build(a, 1, 0, n - 1);
    printf("before: sum(0..5) = %d\\n", query(1, 0, n - 1, 0, 5));  // 36
    update(1, 0, n - 1, 2, 50);       // a[2]=5 → 50
    printf("after:  sum(0..5) = %d\\n", query(1, 0, n - 1, 0, 5));  // 81
    return 0;
}`,

  cpp: `#include <iostream>
#include <vector>

struct SegTree {
    std::vector<int> seg; int n;
    SegTree(const std::vector<int>& a) : seg(4 * a.size(), 0), n(a.size()) {
        build(a, 1, 0, n - 1);
    }
    void build(const std::vector<int>& a, int node, int lo, int hi) {
        if (lo == hi) { seg[node] = a[lo]; return; }
        int mid = (lo + hi) / 2;
        build(a, node*2, lo, mid); build(a, node*2+1, mid+1, hi);
        seg[node] = seg[node*2] + seg[node*2+1];
    }
    void update(int node, int lo, int hi, int idx, int val) {
        if (lo == hi) { seg[node] = val; return; }
        int mid = (lo + hi) / 2;
        if (idx <= mid) update(node*2, lo, mid, idx, val);
        else            update(node*2+1, mid+1, hi, idx, val);
        seg[node] = seg[node*2] + seg[node*2+1];
    }
    int query(int node, int lo, int hi, int ql, int qh) {
        if (qh < lo || hi < ql) return 0;
        if (ql <= lo && hi <= qh) return seg[node];
        int mid = (lo + hi) / 2;
        return query(node*2, lo, mid, ql, qh) + query(node*2+1, mid+1, hi, ql, qh);
    }
};

int main() {
    std::vector<int> a = {1, 3, 5, 7, 9, 11};
    SegTree t(a);
    std::cout << "before: sum = " << t.query(1, 0, 5, 0, 5) << "\\n";
    t.update(1, 0, 5, 2, 50);
    std::cout << "after:  sum = " << t.query(1, 0, 5, 0, 5) << "\\n";
    return 0;
}`,

  python: `class SegTree:
    def __init__(self, a):
        self.n = len(a); self.seg = [0] * (4 * self.n)
        self._build(a, 1, 0, self.n - 1)
    def _build(self, a, node, lo, hi):
        if lo == hi: self.seg[node] = a[lo]; return
        mid = (lo + hi) // 2
        self._build(a, node*2, lo, mid); self._build(a, node*2+1, mid+1, hi)
        self.seg[node] = self.seg[node*2] + self.seg[node*2+1]
    def update(self, node, lo, hi, idx, val):
        if lo == hi: self.seg[node] = val; return
        mid = (lo + hi) // 2
        if idx <= mid: self.update(node*2, lo, mid, idx, val)
        else:          self.update(node*2+1, mid+1, hi, idx, val)
        self.seg[node] = self.seg[node*2] + self.seg[node*2+1]
    def query(self, node, lo, hi, ql, qh):
        if qh < lo or hi < ql: return 0
        if ql <= lo and hi <= qh: return self.seg[node]
        mid = (lo + hi) // 2
        return self.query(node*2, lo, mid, ql, qh) + self.query(node*2+1, mid+1, hi, ql, qh)

if __name__ == "__main__":
    t = SegTree([1, 3, 5, 7, 9, 11])
    print("before: sum =", t.query(1, 0, 5, 0, 5))
    t.update(1, 0, 5, 2, 50)
    print("after:  sum =", t.query(1, 0, 5, 0, 5))`,

  java: `public class Main {
    static int[] seg; static int n;
    static void build(int[] a, int node, int lo, int hi) {
        if (lo == hi) { seg[node] = a[lo]; return; }
        int mid = (lo + hi) / 2;
        build(a, node*2, lo, mid); build(a, node*2+1, mid+1, hi);
        seg[node] = seg[node*2] + seg[node*2+1];
    }
    static void update(int node, int lo, int hi, int idx, int val) {
        if (lo == hi) { seg[node] = val; return; }
        int mid = (lo + hi) / 2;
        if (idx <= mid) update(node*2, lo, mid, idx, val);
        else            update(node*2+1, mid+1, hi, idx, val);
        seg[node] = seg[node*2] + seg[node*2+1];
    }
    static int query(int node, int lo, int hi, int ql, int qh) {
        if (qh < lo || hi < ql) return 0;
        if (ql <= lo && hi <= qh) return seg[node];
        int mid = (lo + hi) / 2;
        return query(node*2, lo, mid, ql, qh) + query(node*2+1, mid+1, hi, ql, qh);
    }
    public static void main(String[] args) {
        int[] a = {1, 3, 5, 7, 9, 11};
        n = a.length; seg = new int[4 * n];
        build(a, 1, 0, n - 1);
        System.out.println("before: sum = " + query(1, 0, 5, 0, 5));
        update(1, 0, 5, 2, 50);
        System.out.println("after:  sum = " + query(1, 0, 5, 0, 5));
    }
}`,

  rust: `struct SegTree { seg: Vec<i64>, n: usize }

impl SegTree {
    fn new(a: &[i64]) -> Self {
        let n = a.len();
        let mut t = SegTree { seg: vec![0; 4 * n], n };
        t.build(a, 1, 0, n - 1); t
    }
    fn build(&mut self, a: &[i64], node: usize, lo: usize, hi: usize) {
        if lo == hi { self.seg[node] = a[lo]; return; }
        let mid = (lo + hi) / 2;
        self.build(a, node*2, lo, mid); self.build(a, node*2 + 1, mid + 1, hi);
        self.seg[node] = self.seg[node*2] + self.seg[node*2 + 1];
    }
    fn update(&mut self, node: usize, lo: usize, hi: usize, idx: usize, val: i64) {
        if lo == hi { self.seg[node] = val; return; }
        let mid = (lo + hi) / 2;
        if idx <= mid { self.update(node*2, lo, mid, idx, val); }
        else          { self.update(node*2 + 1, mid + 1, hi, idx, val); }
        self.seg[node] = self.seg[node*2] + self.seg[node*2 + 1];
    }
    fn query(&self, node: usize, lo: usize, hi: usize, ql: usize, qh: usize) -> i64 {
        if qh < lo || hi < ql { return 0; }
        if ql <= lo && hi <= qh { return self.seg[node]; }
        let mid = (lo + hi) / 2;
        self.query(node*2, lo, mid, ql, qh) + self.query(node*2 + 1, mid + 1, hi, ql, qh)
    }
}

fn main() {
    let a: [i64; 6] = [1, 3, 5, 7, 9, 11];
    let mut t = SegTree::new(&a);
    println!("before: sum = {}", t.query(1, 0, 5, 0, 5));
    t.update(1, 0, 5, 2, 50);
    println!("after:  sum = {}", t.query(1, 0, 5, 0, 5));
}`,
}

export const SEG_UPDATE_SAMPLES = [
  { name: 'Point-set',   description: 'Update a[2]=5 to 50; sum jumps from 36 to 81', stdin: '', expected: '' },
  { name: 'Zero out',    description: 'Set an element to 0',                          stdin: '', expected: '' },
]
