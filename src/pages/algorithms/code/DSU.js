// DSU / Union-Find — find with path compression + union by rank.
export const DSU_CODE = {
  pseudo: `function find(x):
    if parent[x] == x: return x
    parent[x] = find(parent[x])   // path compression
    return parent[x]

function union(a, b):
    rA, rB = find(a), find(b)
    if rA == rB: return
    if rank[rA] < rank[rB]: swap(rA, rB)
    parent[rB] = rA               // union by rank
    if rank[rA] == rank[rB]: rank[rA] += 1`,

  c: `static int parent[100000];
static int rnk[100000];

int find_(int x) {
    if (parent[x] == x) return x;
    return parent[x] = find_(parent[x]);   // path compression
}
void union_(int a, int b) {
    int rA = find_(a), rB = find_(b);
    if (rA == rB) return;
    if (rnk[rA] < rnk[rB]) { int t = rA; rA = rB; rB = t; }
    parent[rB] = rA;                       // union by rank
    if (rnk[rA] == rnk[rB]) rnk[rA]++;
}`,

  cpp: `#include <vector>
#include <numeric>

class DSU {
    std::vector<int> parent, rnk;
public:
    DSU(int n) : parent(n), rnk(n, 0) { std::iota(parent.begin(), parent.end(), 0); }

    int find(int x) {
        if (parent[x] == x) return x;
        return parent[x] = find(parent[x]);            // path compression
    }
    void unite(int a, int b) {
        int rA = find(a), rB = find(b);
        if (rA == rB) return;
        if (rnk[rA] < rnk[rB]) std::swap(rA, rB);
        parent[rB] = rA;                                // union by rank
        if (rnk[rA] == rnk[rB]) rnk[rA]++;
    }
};`,

  python: `class DSU:
    def __init__(self, n: int) -> None:
        self.parent = list(range(n))
        self.rank   = [0] * n

    def find(self, x: int) -> int:
        if self.parent[x] == x:
            return x
        self.parent[x] = self.find(self.parent[x])      # path compression
        return self.parent[x]

    def union(self, a: int, b: int) -> None:
        rA, rB = self.find(a), self.find(b)
        if rA == rB:
            return
        if self.rank[rA] < self.rank[rB]:
            rA, rB = rB, rA
        self.parent[rB] = rA                            # union by rank
        if self.rank[rA] == self.rank[rB]:
            self.rank[rA] += 1`,

  java: `public class DSU {
    private final int[] parent, rnk;
    public DSU(int n) {
        parent = new int[n]; rnk = new int[n];
        for (int i = 0; i < n; i++) parent[i] = i;
    }

    public int find(int x) {
        if (parent[x] == x) return x;
        parent[x] = find(parent[x]);            // path compression
        return parent[x];
    }
    public void union(int a, int b) {
        int rA = find(a), rB = find(b);
        if (rA == rB) return;
        if (rnk[rA] < rnk[rB]) { int t = rA; rA = rB; rB = t; }
        parent[rB] = rA;                        // union by rank
        if (rnk[rA] == rnk[rB]) rnk[rA]++;
    }
}`,

  rust: `pub struct Dsu { parent: Vec<usize>, rank: Vec<u32> }

impl Dsu {
    pub fn new(n: usize) -> Self {
        Self { parent: (0..n).collect(), rank: vec![0; n] }
    }

    pub fn find(&mut self, x: usize) -> usize {
        if self.parent[x] == x { return x; }
        let root = self.find(self.parent[x]);
        self.parent[x] = root;                          // path compression
        root
    }

    pub fn union(&mut self, a: usize, b: usize) {
        let (mut ra, mut rb) = (self.find(a), self.find(b));
        if ra == rb { return; }
        if self.rank[ra] < self.rank[rb] { std::mem::swap(&mut ra, &mut rb); }
        self.parent[rb] = ra;                           // union by rank
        if self.rank[ra] == self.rank[rb] { self.rank[ra] += 1; }
    }
}`,
}
