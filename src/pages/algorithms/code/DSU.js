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

  c: `#include <stdio.h>
#define N 8
static int parent[N];
static int rnk[N];

int find_(int x) {
    if (parent[x] == x) return x;
    return parent[x] = find_(parent[x]);
}
void union_(int a, int b) {
    int rA = find_(a), rB = find_(b);
    if (rA == rB) return;
    if (rnk[rA] < rnk[rB]) { int t = rA; rA = rB; rB = t; }
    parent[rB] = rA;
    if (rnk[rA] == rnk[rB]) rnk[rA]++;
}

int main(void) {
    for (int i = 0; i < N; i++) { parent[i] = i; rnk[i] = 0; }
    // Merge: {0,1,2}, {3,4}, {5,6,7}
    union_(0, 1); union_(1, 2);
    union_(3, 4);
    union_(5, 6); union_(6, 7);

    printf("find(2) = %d\\n", find_(2));
    printf("same(0,2) = %d\\n", find_(0) == find_(2));
    printf("same(0,4) = %d\\n", find_(0) == find_(4));
    printf("same(5,7) = %d\\n", find_(5) == find_(7));
    return 0;
}`,

  cpp: `#include <iostream>
#include <vector>
#include <numeric>

class DSU {
    std::vector<int> parent, rnk;
public:
    DSU(int n) : parent(n), rnk(n, 0) { std::iota(parent.begin(), parent.end(), 0); }
    int find(int x) {
        if (parent[x] == x) return x;
        return parent[x] = find(parent[x]);
    }
    void unite(int a, int b) {
        int rA = find(a), rB = find(b);
        if (rA == rB) return;
        if (rnk[rA] < rnk[rB]) std::swap(rA, rB);
        parent[rB] = rA;
        if (rnk[rA] == rnk[rB]) rnk[rA]++;
    }
};

int main() {
    DSU d(8);
    d.unite(0, 1); d.unite(1, 2);
    d.unite(3, 4);
    d.unite(5, 6); d.unite(6, 7);
    std::cout << "find(2) = " << d.find(2) << "\\n";
    std::cout << "same(0,2) = " << (d.find(0) == d.find(2)) << "\\n";
    std::cout << "same(0,4) = " << (d.find(0) == d.find(4)) << "\\n";
    std::cout << "same(5,7) = " << (d.find(5) == d.find(7)) << "\\n";
    return 0;
}`,

  python: `class DSU:
    def __init__(self, n):
        self.parent = list(range(n)); self.rank = [0] * n
    def find(self, x):
        if self.parent[x] == x: return x
        self.parent[x] = self.find(self.parent[x])
        return self.parent[x]
    def union(self, a, b):
        rA, rB = self.find(a), self.find(b)
        if rA == rB: return
        if self.rank[rA] < self.rank[rB]: rA, rB = rB, rA
        self.parent[rB] = rA
        if self.rank[rA] == self.rank[rB]: self.rank[rA] += 1

if __name__ == "__main__":
    d = DSU(8)
    d.union(0, 1); d.union(1, 2)
    d.union(3, 4)
    d.union(5, 6); d.union(6, 7)
    print("find(2) =", d.find(2))
    print("same(0,2) =", d.find(0) == d.find(2))
    print("same(0,4) =", d.find(0) == d.find(4))
    print("same(5,7) =", d.find(5) == d.find(7))`,

  java: `public class Main {
    static int[] parent, rnk;
    static int find(int x) {
        if (parent[x] == x) return x;
        return parent[x] = find(parent[x]);
    }
    static void union(int a, int b) {
        int rA = find(a), rB = find(b);
        if (rA == rB) return;
        if (rnk[rA] < rnk[rB]) { int t = rA; rA = rB; rB = t; }
        parent[rB] = rA;
        if (rnk[rA] == rnk[rB]) rnk[rA]++;
    }
    public static void main(String[] args) {
        int n = 8;
        parent = new int[n]; rnk = new int[n];
        for (int i = 0; i < n; i++) parent[i] = i;
        union(0, 1); union(1, 2);
        union(3, 4);
        union(5, 6); union(6, 7);
        System.out.println("find(2) = " + find(2));
        System.out.println("same(0,2) = " + (find(0) == find(2)));
        System.out.println("same(0,4) = " + (find(0) == find(4)));
        System.out.println("same(5,7) = " + (find(5) == find(7)));
    }
}`,

  rust: `struct Dsu { parent: Vec<usize>, rank: Vec<u32> }

impl Dsu {
    fn new(n: usize) -> Self { Self { parent: (0..n).collect(), rank: vec![0; n] } }
    fn find(&mut self, x: usize) -> usize {
        if self.parent[x] == x { return x; }
        let root = self.find(self.parent[x]);
        self.parent[x] = root;
        root
    }
    fn union(&mut self, a: usize, b: usize) {
        let (mut ra, mut rb) = (self.find(a), self.find(b));
        if ra == rb { return; }
        if self.rank[ra] < self.rank[rb] { std::mem::swap(&mut ra, &mut rb); }
        self.parent[rb] = ra;
        if self.rank[ra] == self.rank[rb] { self.rank[ra] += 1; }
    }
}

fn main() {
    let mut d = Dsu::new(8);
    d.union(0, 1); d.union(1, 2);
    d.union(3, 4);
    d.union(5, 6); d.union(6, 7);
    println!("find(2) = {}", d.find(2));
    println!("same(0,2) = {}", d.find(0) == d.find(2));
    println!("same(0,4) = {}", d.find(0) == d.find(4));
    println!("same(5,7) = {}", d.find(5) == d.find(7));
}`,
}

export const DSU_SAMPLES = [
  { name: 'Three groups', description: 'Merge into {0,1,2},{3,4},{5,6,7} — verify roots', stdin: '', expected: '' },
  { name: 'Chain',        description: 'Chain 0-1-2-3-4-5 via successive unions',           stdin: '', expected: '' },
]
