// MST — Kruskal (edge-list + DSU) and Prim (priority-queue frontier).
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

  c: `#include <stdlib.h>

typedef struct { int u, v, w; } Edge;
static int cmp(const void *a, const void *b) { return ((Edge*)a)->w - ((Edge*)b)->w; }

// Assumes DSU with parent[]/find/union defined elsewhere.
int kruskal(int V, Edge *E, int m, Edge *mst) {
    qsort(E, m, sizeof(Edge), cmp);
    for (int i = 0; i < V; i++) parent[i] = i;
    int cnt = 0;
    for (int i = 0; i < m && cnt < V - 1; i++) {
        if (find_(E[i].u) != find_(E[i].v)) {
            union_(E[i].u, E[i].v);
            mst[cnt++] = E[i];
        }
    }
    return cnt;   // == V-1 for a connected graph
}`,

  cpp: `#include <algorithm>
#include <vector>
#include <tuple>

using Edge = std::tuple<int,int,int>;   // (u, v, w)

std::vector<Edge> kruskal(int V, std::vector<Edge> E, DSU& dsu) {
    std::sort(E.begin(), E.end(),
              [](auto& a, auto& b){ return std::get<2>(a) < std::get<2>(b); });
    std::vector<Edge> mst;
    for (auto& [u, v, w] : E) {
        if (dsu.find(u) != dsu.find(v)) {
            dsu.unite(u, v);
            mst.push_back({u, v, w});
            if ((int)mst.size() == V - 1) break;
        }
    }
    return mst;
}`,

  python: `def kruskal(V: int, edges: list[tuple[int, int, int]], dsu) -> list[tuple[int, int, int]]:
    edges = sorted(edges, key=lambda e: e[2])       # by weight
    mst: list[tuple[int, int, int]] = []
    for u, v, w in edges:
        if dsu.find(u) != dsu.find(v):
            dsu.union(u, v)
            mst.append((u, v, w))
            if len(mst) == V - 1:
                break
    return mst`,

  java: `import java.util.*;

public static List<int[]> kruskal(int V, int[][] edges, DSU dsu) {
    Arrays.sort(edges, (a, b) -> a[2] - b[2]);      // by weight
    List<int[]> mst = new ArrayList<>();
    for (int[] e : edges) {
        if (dsu.find(e[0]) != dsu.find(e[1])) {
            dsu.union(e[0], e[1]);
            mst.add(e);
            if (mst.size() == V - 1) break;
        }
    }
    return mst;
}`,

  rust: `pub fn kruskal(v: usize, mut edges: Vec<(usize, usize, i32)>, dsu: &mut Dsu) -> Vec<(usize, usize, i32)> {
    edges.sort_by_key(|e| e.2);                     // by weight
    let mut mst: Vec<(usize, usize, i32)> = Vec::new();
    for (u, w, cost) in edges {
        if dsu.find(u) != dsu.find(w) {
            dsu.union(u, w);
            mst.push((u, w, cost));
            if mst.len() == v - 1 { break; }
        }
    }
    mst
}`,
}

export const MST_PRIM_CODE = {
  pseudo: `function prim(V, E, start):
    inTree = {start}
    mst = []
    while inTree.size < |V|:
        pick cheapest edge (u, v, w) with u in inTree, v not in inTree
        inTree.add(v)
        mst.push((u, v, w))
    return mst`,

  c: `#include <stdbool.h>
#include <limits.h>

// Prim on a dense graph with adjacency matrix M[V][V] (0 = no edge).
void prim(int V, int M[][V], int start, int mst_u[], int mst_v[], int *mst_w) {
    bool inTree[V]; int key[V]; int par[V];
    for (int i = 0; i < V; i++) { inTree[i] = false; key[i] = INT_MAX; par[i] = -1; }
    key[start] = 0;
    for (int k = 0; k < V; k++) {
        int u = -1;
        for (int i = 0; i < V; i++)
            if (!inTree[i] && (u == -1 || key[i] < key[u])) u = i;
        inTree[u] = true;
        for (int v = 0; v < V; v++)
            if (M[u][v] && !inTree[v] && M[u][v] < key[v]) {
                key[v] = M[u][v]; par[v] = u;
            }
    }
    // reconstruct: for each i != start, edge = (par[i], i, key[i])
}`,

  cpp: `#include <queue>
#include <vector>
#include <tuple>

using PQItem = std::tuple<int,int,int>;   // (w, u, v)

std::vector<PQItem> prim(int V, std::vector<std::vector<std::pair<int,int>>>& adj, int start) {
    std::vector<bool> inTree(V, false);
    std::priority_queue<PQItem, std::vector<PQItem>, std::greater<>> pq;
    std::vector<PQItem> mst;
    inTree[start] = true;
    for (auto& [v, w] : adj[start]) pq.push({w, start, v});
    while (!pq.empty() && (int)mst.size() < V - 1) {
        auto [w, u, v] = pq.top(); pq.pop();
        if (inTree[v]) continue;
        inTree[v] = true;
        mst.push_back({w, u, v});
        for (auto& [x, wx] : adj[v]) if (!inTree[x]) pq.push({wx, v, x});
    }
    return mst;
}`,

  python: `import heapq

def prim(V: int, adj: dict[int, list[tuple[int, int]]], start: int):
    in_tree = {start}
    mst: list[tuple[int, int, int]] = []
    pq = [(w, start, v) for v, w in adj[start]]     # (weight, u, v)
    heapq.heapify(pq)
    while pq and len(mst) < V - 1:
        w, u, v = heapq.heappop(pq)
        if v in in_tree:
            continue
        in_tree.add(v)
        mst.append((u, v, w))
        for x, wx in adj[v]:
            if x not in in_tree:
                heapq.heappush(pq, (wx, v, x))
    return mst`,

  java: `import java.util.*;

public static List<int[]> prim(int V, List<int[]>[] adj, int start) {
    boolean[] inTree = new boolean[V];
    PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[0] - b[0]);   // [w, u, v]
    List<int[]> mst = new ArrayList<>();
    inTree[start] = true;
    for (int[] e : adj[start]) pq.offer(new int[]{e[1], start, e[0]});
    while (!pq.isEmpty() && mst.size() < V - 1) {
        int[] cur = pq.poll();
        int w = cur[0], u = cur[1], v = cur[2];
        if (inTree[v]) continue;
        inTree[v] = true;
        mst.add(new int[]{u, v, w});
        for (int[] e : adj[v]) if (!inTree[e[0]]) pq.offer(new int[]{e[1], v, e[0]});
    }
    return mst;
}`,

  rust: `use std::collections::BinaryHeap;
use std::cmp::Reverse;

pub fn prim(v: usize, adj: &Vec<Vec<(usize, i32)>>, start: usize) -> Vec<(usize, usize, i32)> {
    let mut in_tree = vec![false; v];
    let mut pq: BinaryHeap<Reverse<(i32, usize, usize)>> = BinaryHeap::new();
    let mut mst: Vec<(usize, usize, i32)> = Vec::new();
    in_tree[start] = true;
    for &(nb, w) in &adj[start] { pq.push(Reverse((w, start, nb))); }
    while let Some(Reverse((w, u, nb))) = pq.pop() {
        if in_tree[nb] { continue; }
        in_tree[nb] = true;
        mst.push((u, nb, w));
        if mst.len() == v - 1 { break; }
        for &(x, wx) in &adj[nb] { if !in_tree[x] { pq.push(Reverse((wx, nb, x))); } }
    }
    mst
}`,
}
