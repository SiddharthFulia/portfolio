// MST — Kruskal (edge-list + DSU) and Prim (priority-queue frontier).
// Runnable end-to-end on a shared 5-node sample graph. Both should produce
// the same total weight (17 here).
//
// Graph:  0-1(2), 0-3(6), 1-2(3), 1-3(8), 1-4(5), 2-4(7), 3-4(9)
// MST:    (0,1,2), (1,2,3), (1,4,5), (0,3,6)  total = 16
export const MST_KRUSKAL_CODE = {
  pseudo: `function kruskal(V, E):
    sort E by weight ascending
    dsu = makeDSU(V)
    mst = []
    for (u, v, w) in E:
        if dsu.find(u) != dsu.find(v):
            dsu.union(u, v)
            mst.push((u, v, w))
        if mst.length == |V| - 1: break
    return mst`,

  c: `#include <stdio.h>
#include <stdlib.h>

typedef struct { int u, v, w; } Edge;
static int cmp(const void *a, const void *b) { return ((Edge*)a)->w - ((Edge*)b)->w; }

static int parent[16];
static int find_(int x) { return parent[x] == x ? x : (parent[x] = find_(parent[x])); }
static void union_(int a, int b) { parent[find_(a)] = find_(b); }

int main(void) {
    Edge E[] = {{0,1,2},{0,3,6},{1,2,3},{1,3,8},{1,4,5},{2,4,7},{3,4,9}};
    int m = 7, V = 5;
    qsort(E, m, sizeof(Edge), cmp);
    for (int i = 0; i < V; i++) parent[i] = i;
    int total = 0;
    for (int i = 0; i < m; i++) {
        if (find_(E[i].u) != find_(E[i].v)) {
            union_(E[i].u, E[i].v);
            printf("edge (%d,%d) w=%d\\n", E[i].u, E[i].v, E[i].w);
            total += E[i].w;
        }
    }
    printf("Total weight = %d\\n", total);
    return 0;
}`,

  cpp: `#include <iostream>
#include <algorithm>
#include <vector>
#include <tuple>
#include <numeric>

int main() {
    std::vector<std::tuple<int,int,int>> E = {
        {0,1,2},{0,3,6},{1,2,3},{1,3,8},{1,4,5},{2,4,7},{3,4,9}
    };
    int V = 5;
    std::sort(E.begin(), E.end(), [](auto& a, auto& b){ return std::get<2>(a) < std::get<2>(b); });
    std::vector<int> parent(V);
    std::iota(parent.begin(), parent.end(), 0);
    std::function<int(int)> find_ = [&](int x) -> int {
        return parent[x] == x ? x : (parent[x] = find_(parent[x]));
    };
    int total = 0;
    for (auto& [u, v, w] : E) {
        int ru = find_(u), rv = find_(v);
        if (ru != rv) {
            parent[ru] = rv;
            std::cout << "edge (" << u << "," << v << ") w=" << w << "\\n";
            total += w;
        }
    }
    std::cout << "Total weight = " << total << "\\n";
    return 0;
}`,

  python: `def kruskal(V, edges):
    edges = sorted(edges, key=lambda e: e[2])
    parent = list(range(V))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    total = 0
    picked = []
    for u, v, w in edges:
        ru, rv = find(u), find(v)
        if ru != rv:
            parent[ru] = rv
            picked.append((u, v, w))
            total += w
    return picked, total

if __name__ == "__main__":
    E = [(0,1,2),(0,3,6),(1,2,3),(1,3,8),(1,4,5),(2,4,7),(3,4,9)]
    picked, total = kruskal(5, E)
    for u, v, w in picked:
        print(f"edge ({u},{v}) w={w}")
    print("Total weight =", total)`,

  java: `import java.util.*;

public class Main {
    static int[] parent;
    static int find(int x) {
        while (parent[x] != x) { parent[x] = parent[parent[x]]; x = parent[x]; }
        return x;
    }
    public static void main(String[] args) {
        int V = 5;
        int[][] E = {{0,1,2},{0,3,6},{1,2,3},{1,3,8},{1,4,5},{2,4,7},{3,4,9}};
        Arrays.sort(E, (a, b) -> a[2] - b[2]);
        parent = new int[V];
        for (int i = 0; i < V; i++) parent[i] = i;
        int total = 0;
        for (int[] e : E) {
            int ru = find(e[0]), rv = find(e[1]);
            if (ru != rv) {
                parent[ru] = rv;
                System.out.println("edge (" + e[0] + "," + e[1] + ") w=" + e[2]);
                total += e[2];
            }
        }
        System.out.println("Total weight = " + total);
    }
}`,

  rust: `fn kruskal(v: usize, mut edges: Vec<(usize, usize, i32)>) -> (Vec<(usize, usize, i32)>, i32) {
    edges.sort_by_key(|e| e.2);
    let mut parent: Vec<usize> = (0..v).collect();
    fn find(parent: &mut Vec<usize>, mut x: usize) -> usize {
        while parent[x] != x {
            let p = parent[x];
            parent[x] = parent[p];
            x = parent[x];
        }
        x
    }
    let mut mst = Vec::new();
    let mut total = 0;
    for (u, w, cost) in edges {
        let ru = find(&mut parent, u);
        let rv = find(&mut parent, w);
        if ru != rv {
            parent[ru] = rv;
            mst.push((u, w, cost));
            total += cost;
        }
    }
    (mst, total)
}

fn main() {
    let e = vec![(0,1,2),(0,3,6),(1,2,3),(1,3,8),(1,4,5),(2,4,7),(3,4,9)];
    let (mst, total) = kruskal(5, e);
    for (u, v, w) in &mst { println!("edge ({},{}) w={}", u, v, w); }
    println!("Total weight = {}", total);
}`,
}

export const MST_KRUSKAL_SAMPLES = [
  { name: '5-node graph', description: '7 edges, expected MST weight = 16', stdin: '', expected: '' },
  { name: 'Sparse',       description: 'Minimal spanning-tree case',        stdin: '', expected: '' },
]

export const MST_PRIM_CODE = {
  pseudo: `function prim(V, adj, start):
    inTree = {start}
    mst = []
    while inTree.size < |V|:
        pick cheapest edge (u, v, w) with u in inTree, v not in inTree
        inTree.add(v)
        mst.push((u, v, w))
    return mst`,

  c: `#include <stdio.h>
#include <stdbool.h>
#include <limits.h>
#define V 5

int main(void) {
    int M[V][V] = {
        {0, 2, 0, 6, 0},
        {2, 0, 3, 8, 5},
        {0, 3, 0, 0, 7},
        {6, 8, 0, 0, 9},
        {0, 5, 7, 9, 0}
    };
    bool inTree[V] = {0};
    int key[V], par[V];
    for (int i = 0; i < V; i++) { key[i] = INT_MAX; par[i] = -1; }
    key[0] = 0;
    for (int k = 0; k < V; k++) {
        int u = -1;
        for (int i = 0; i < V; i++) if (!inTree[i] && (u == -1 || key[i] < key[u])) u = i;
        inTree[u] = true;
        for (int v = 0; v < V; v++)
            if (M[u][v] && !inTree[v] && M[u][v] < key[v]) { key[v] = M[u][v]; par[v] = u; }
    }
    int total = 0;
    for (int i = 1; i < V; i++) {
        printf("edge (%d,%d) w=%d\\n", par[i], i, key[i]);
        total += key[i];
    }
    printf("Total weight = %d\\n", total);
    return 0;
}`,

  cpp: `#include <iostream>
#include <queue>
#include <vector>
#include <tuple>

int main() {
    int V = 5;
    std::vector<std::vector<std::pair<int,int>>> adj(V);
    auto add = [&](int u, int v, int w){ adj[u].push_back({v,w}); adj[v].push_back({u,w}); };
    add(0,1,2); add(0,3,6); add(1,2,3); add(1,3,8);
    add(1,4,5); add(2,4,7); add(3,4,9);

    std::vector<bool> inTree(V, false);
    std::priority_queue<std::tuple<int,int,int>, std::vector<std::tuple<int,int,int>>, std::greater<>> pq;
    inTree[0] = true;
    for (auto& [v, w] : adj[0]) pq.push({w, 0, v});
    int total = 0;
    while (!pq.empty()) {
        auto [w, u, v] = pq.top(); pq.pop();
        if (inTree[v]) continue;
        inTree[v] = true;
        std::cout << "edge (" << u << "," << v << ") w=" << w << "\\n";
        total += w;
        for (auto& [x, wx] : adj[v]) if (!inTree[x]) pq.push({wx, v, x});
    }
    std::cout << "Total weight = " << total << "\\n";
    return 0;
}`,

  python: `import heapq
from collections import defaultdict

def prim(V, adj, start=0):
    in_tree = {start}
    mst = []
    pq = [(w, start, v) for v, w in adj[start]]
    heapq.heapify(pq)
    while pq and len(mst) < V - 1:
        w, u, v = heapq.heappop(pq)
        if v in in_tree: continue
        in_tree.add(v)
        mst.append((u, v, w))
        for x, wx in adj[v]:
            if x not in in_tree: heapq.heappush(pq, (wx, v, x))
    return mst

if __name__ == "__main__":
    adj = defaultdict(list)
    for u, v, w in [(0,1,2),(0,3,6),(1,2,3),(1,3,8),(1,4,5),(2,4,7),(3,4,9)]:
        adj[u].append((v, w)); adj[v].append((u, w))
    mst = prim(5, adj, 0)
    total = 0
    for u, v, w in mst:
        print(f"edge ({u},{v}) w={w}")
        total += w
    print("Total weight =", total)`,

  java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        int V = 5;
        List<int[]>[] adj = new List[V];
        for (int i = 0; i < V; i++) adj[i] = new ArrayList<>();
        int[][] edges = {{0,1,2},{0,3,6},{1,2,3},{1,3,8},{1,4,5},{2,4,7},{3,4,9}};
        for (int[] e : edges) {
            adj[e[0]].add(new int[]{e[1], e[2]});
            adj[e[1]].add(new int[]{e[0], e[2]});
        }

        boolean[] inTree = new boolean[V];
        PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[0] - b[0]);
        inTree[0] = true;
        for (int[] e : adj[0]) pq.offer(new int[]{e[1], 0, e[0]});
        int total = 0;
        while (!pq.isEmpty()) {
            int[] cur = pq.poll();
            int w = cur[0], u = cur[1], v = cur[2];
            if (inTree[v]) continue;
            inTree[v] = true;
            System.out.println("edge (" + u + "," + v + ") w=" + w);
            total += w;
            for (int[] e : adj[v]) if (!inTree[e[0]]) pq.offer(new int[]{e[1], v, e[0]});
        }
        System.out.println("Total weight = " + total);
    }
}`,

  rust: `use std::collections::BinaryHeap;
use std::cmp::Reverse;

fn main() {
    let v = 5;
    let mut adj: Vec<Vec<(usize, i32)>> = vec![vec![]; v];
    for (u, w, cost) in [(0,1,2),(0,3,6),(1,2,3),(1,3,8),(1,4,5),(2,4,7),(3,4,9)] {
        adj[u].push((w, cost));
        adj[w].push((u, cost));
    }

    let mut in_tree = vec![false; v];
    let mut pq: BinaryHeap<Reverse<(i32, usize, usize)>> = BinaryHeap::new();
    in_tree[0] = true;
    for &(nb, w) in &adj[0] { pq.push(Reverse((w, 0, nb))); }
    let mut total = 0;
    while let Some(Reverse((w, u, nb))) = pq.pop() {
        if in_tree[nb] { continue; }
        in_tree[nb] = true;
        println!("edge ({},{}) w={}", u, nb, w);
        total += w;
        for &(x, wx) in &adj[nb] { if !in_tree[x] { pq.push(Reverse((wx, nb, x))); } }
    }
    println!("Total weight = {}", total);
}`,
}

export const MST_PRIM_SAMPLES = [
  { name: '5-node graph', description: '7 edges, same graph as Kruskal — expected weight = 16', stdin: '', expected: '' },
  { name: 'Start diff',   description: 'Start from node 2 instead of 0',                        stdin: '', expected: '' },
]
