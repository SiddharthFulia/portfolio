// FenwickTrees (BIT) — point update + prefix sum via low-bit trick.
export const BIT_CODE = {
  pseudo: `function update(i, delta):
    while i <= n:
        bit[i] += delta
        i += i & -i     // low bit — climb to responsible parent

function prefix(r):
    s = 0
    while r > 0:
        s += bit[r]
        r -= r & -r     // low bit — descend accumulating
    return s`,

  c: `#define MAXN 100001
static int bit[MAXN];
static int N;

// 1-indexed. i & -i extracts the lowest set bit — the range length
// represented by that node.
void update(int i, int delta) {
    for (; i <= N; i += i & -i) bit[i] += delta;
}
int prefix(int r) {
    int s = 0;
    for (; r > 0; r -= r & -r) s += bit[r];
    return s;
}`,

  cpp: `#include <vector>

class BIT {
    std::vector<int> bit;
public:
    BIT(int n) : bit(n + 1, 0) {}

    void update(int i, int delta) {
        for (; i < (int)bit.size(); i += i & -i) bit[i] += delta;
    }
    int prefix(int r) {
        int s = 0;
        for (; r > 0; r -= r & -r) s += bit[r];
        return s;
    }
};`,

  python: `class BIT:
    def __init__(self, n: int) -> None:
        self.n = n
        self.bit = [0] * (n + 1)      # 1-indexed

    def update(self, i: int, delta: int) -> None:
        while i <= self.n:
            self.bit[i] += delta
            i += i & -i               # climb to parent

    def prefix(self, r: int) -> int:
        s = 0
        while r > 0:
            s += self.bit[r]
            r -= r & -r               # descend accumulating
        return s`,

  java: `public class BIT {
    private final int[] bit;
    private final int n;
    public BIT(int n) { this.n = n; bit = new int[n + 1]; }

    public void update(int i, int delta) {
        for (; i <= n; i += i & -i) bit[i] += delta;
    }
    public int prefix(int r) {
        int s = 0;
        for (; r > 0; r -= r & -r) s += bit[r];
        return s;
    }
}`,

  rust: `pub struct Bit { pub tree: Vec<i64>, pub n: usize }

impl Bit {
    pub fn new(n: usize) -> Self { Self { tree: vec![0; n + 1], n } }

    // 1-indexed. i & i.wrapping_neg() is the low-bit isolation.
    pub fn update(&mut self, mut i: usize, delta: i64) {
        while i <= self.n {
            self.tree[i] += delta;
            i += i & i.wrapping_neg();
        }
    }
    pub fn prefix(&self, mut r: usize) -> i64 {
        let mut s = 0;
        while r > 0 {
            s += self.tree[r];
            r -= r & r.wrapping_neg();
        }
        s
    }
}`,
}
