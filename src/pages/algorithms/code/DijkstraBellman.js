// Dijkstra (PQ) and Bellman-Ford. Runnable end-to-end on 5-node samples.
//
// Graph (weighted, directed):
//   0 -> 1 (4), 0 -> 2 (1), 2 -> 1 (2), 1 -> 3 (1), 2 -> 3 (5), 3 -> 4 (3)
// Shortest paths from 0:  [0, 3, 1, 4, 7]

export const CODE = {
  dijkstra: {
    pseudo: `dijkstra(adj, src):
  dist = [INF, INF, ..]
  dist[src] = 0
  pq = min-heap of (dist, node)
  push (0, src)
  while pq not empty:
    (d, u) = pq.pop()
    if d > dist[u]: continue
    for (v, w) in adj[u]:
      if d + w < dist[v]:
        dist[v] = d + w
        push (dist[v], v)
  return dist`,

    c: `#include <stdio.h>
#include <stdlib.h>
#include <limits.h>

#define N 5
#define M 6

typedef struct { long d; int u; } Node;
static Node heap[64];
static int hsize;

static void hpush(long d, int u) {
    heap[hsize++] = (Node){d, u};
    int i = hsize - 1;
    while (i > 0) {
        int p = (i - 1) / 2;
        if (heap[p].d <= heap[i].d) break;
        Node t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p;
    }
}
static Node hpop(void) {
    Node top = heap[0];
    heap[0] = heap[--hsize];
    int i = 0;
    while (1) {
        int l = 2*i+1, r = 2*i+2, s = i;
        if (l < hsize && heap[l].d < heap[s].d) s = l;
        if (r < hsize && heap[r].d < heap[s].d) s = r;
        if (s == i) break;
        Node t = heap[s]; heap[s] = heap[i]; heap[i] = t; i = s;
    }
    return top;
}

int main(void) {
    // adj[u] flat: pairs (v, w)
    int adj[N][8][2] = {0};
    int deg[N] = {0};
    int edges[M][3] = {{0,1,4},{0,2,1},{2,1,2},{1,3,1},{2,3,5},{3,4,3}};
    for (int i = 0; i < M; i++) {
        int u = edges[i][0]; adj[u][deg[u]][0] = edges[i][1]; adj[u][deg[u]][1] = edges[i][2]; deg[u]++;
    }

    long dist[N]; for (int i = 0; i < N; i++) dist[i] = LONG_MAX;
    dist[0] = 0; hsize = 0; hpush(0, 0);
    while (hsize) {
        Node cur = hpop();
        if (cur.d > dist[cur.u]) continue;
        for (int i = 0; i < deg[cur.u]; i++) {
            int v = adj[cur.u][i][0], w = adj[cur.u][i][1];
            long nd = cur.d + w;
            if (nd < dist[v]) { dist[v] = nd; hpush(nd, v); }
        }
    }
    printf("Distances from 0:");
    for (int i = 0; i < N; i++) printf(" %ld", dist[i]);
    printf("\\n");
    return 0;
}`,

    cpp: `#include <iostream>
#include <vector>
#include <queue>
#include <climits>

std::vector<long long> dijkstra(const std::vector<std::vector<std::pair<int,long long>>>& adj, int src) {
    const long long INF = LLONG_MAX;
    std::vector<long long> dist(adj.size(), INF);
    dist[src] = 0;
    std::priority_queue<std::pair<long long,int>, std::vector<std::pair<long long,int>>, std::greater<>> pq;
    pq.push({0, src});
    while (!pq.empty()) {
        auto [d, u] = pq.top(); pq.pop();
        if (d > dist[u]) continue;
        for (auto [v, w] : adj[u]) {
            if (d + w < dist[v]) { dist[v] = d + w; pq.push({dist[v], v}); }
        }
    }
    return dist;
}

int main() {
    std::vector<std::vector<std::pair<int,long long>>> adj(5);
    int edges[][3] = {{0,1,4},{0,2,1},{2,1,2},{1,3,1},{2,3,5},{3,4,3}};
    for (auto& e : edges) adj[e[0]].push_back({e[1], e[2]});
    auto d = dijkstra(adj, 0);
    std::cout << "Distances from 0:";
    for (long long x : d) std::cout << " " << x;
    std::cout << "\\n";
    return 0;
}`,

    python: `import heapq
from math import inf

def dijkstra(adj, src):
    dist = [inf] * len(adj); dist[src] = 0
    pq = [(0, src)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]: continue
        for v, w in adj[u]:
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd; heapq.heappush(pq, (nd, v))
    return dist

if __name__ == "__main__":
    adj = [[] for _ in range(5)]
    for u, v, w in [(0,1,4),(0,2,1),(2,1,2),(1,3,1),(2,3,5),(3,4,3)]:
        adj[u].append((v, w))
    print("Distances from 0:", dijkstra(adj, 0))`,

    java: `import java.util.*;

public class Main {
    public static long[] dijkstra(List<int[]>[] adj, int src) {
        long[] dist = new long[adj.length];
        Arrays.fill(dist, Long.MAX_VALUE);
        dist[src] = 0;
        PriorityQueue<long[]> pq = new PriorityQueue<>((a, b) -> Long.compare(a[0], b[0]));
        pq.add(new long[]{0, src});
        while (!pq.isEmpty()) {
            long[] cur = pq.poll();
            long d = cur[0]; int u = (int) cur[1];
            if (d > dist[u]) continue;
            for (int[] e : adj[u]) {
                int v = e[0], w = e[1];
                long nd = d + w;
                if (nd < dist[v]) { dist[v] = nd; pq.add(new long[]{nd, v}); }
            }
        }
        return dist;
    }

    public static void main(String[] args) {
        int N = 5;
        List<int[]>[] adj = new List[N];
        for (int i = 0; i < N; i++) adj[i] = new ArrayList<>();
        int[][] edges = {{0,1,4},{0,2,1},{2,1,2},{1,3,1},{2,3,5},{3,4,3}};
        for (int[] e : edges) adj[e[0]].add(new int[]{e[1], e[2]});
        System.out.println("Distances from 0: " + Arrays.toString(dijkstra(adj, 0)));
    }
}`,

    rust: `use std::collections::BinaryHeap;
use std::cmp::Reverse;

fn dijkstra(adj: &Vec<Vec<(usize, u32)>>, src: usize) -> Vec<u32> {
    let n = adj.len();
    let mut dist = vec![u32::MAX; n];
    dist[src] = 0;
    let mut pq: BinaryHeap<Reverse<(u32, usize)>> = BinaryHeap::new();
    pq.push(Reverse((0, src)));
    while let Some(Reverse((d, u))) = pq.pop() {
        if d > dist[u] { continue; }
        for &(v, w) in &adj[u] {
            let nd = d.saturating_add(w);
            if nd < dist[v] { dist[v] = nd; pq.push(Reverse((nd, v))); }
        }
    }
    dist
}

fn main() {
    let n = 5;
    let mut adj: Vec<Vec<(usize, u32)>> = vec![vec![]; n];
    for (u, v, w) in [(0usize,1usize,4u32),(0,2,1),(2,1,2),(1,3,1),(2,3,5),(3,4,3)] {
        adj[u].push((v, w));
    }
    println!("Distances from 0: {:?}", dijkstra(&adj, 0));
}`,
  },

  bellman: {
    pseudo: `bellman_ford(edges, n, src):
  dist = [INF, INF, ..]
  dist[src] = 0
  for i = 1 .. n-1:
    for (u, v, w) in edges:
      if dist[u] + w < dist[v]:
        dist[v] = dist[u] + w
  # one more pass: any relax => negative cycle
  for (u, v, w) in edges:
    if dist[u] + w < dist[v]:
      return "negative cycle"
  return dist`,

    c: `#include <stdio.h>
#include <limits.h>

typedef struct { int u, v; long w; } Edge;

int main(void) {
    int n = 5;
    // Same graph as Dijkstra but with a negative edge added.
    Edge edges[] = {
        {0,1,4},{0,2,1},{2,1,-2},{1,3,1},{2,3,5},{3,4,3}
    };
    int m = 6;
    long dist[5];
    for (int i = 0; i < n; i++) dist[i] = LONG_MAX;
    dist[0] = 0;
    for (int i = 1; i < n; i++) {
        for (int j = 0; j < m; j++) {
            Edge e = edges[j];
            if (dist[e.u] == LONG_MAX) continue;
            if (dist[e.u] + e.w < dist[e.v]) dist[e.v] = dist[e.u] + e.w;
        }
    }
    int cycle = 0;
    for (int j = 0; j < m; j++) {
        Edge e = edges[j];
        if (dist[e.u] != LONG_MAX && dist[e.u] + e.w < dist[e.v]) { cycle = 1; break; }
    }
    if (cycle) printf("Negative cycle detected\\n");
    else {
        printf("Distances from 0:");
        for (int i = 0; i < n; i++) printf(" %ld", dist[i]);
        printf("\\n");
    }
    return 0;
}`,

    cpp: `#include <iostream>
#include <vector>
#include <climits>

struct Edge { int u, v; long long w; };

int main() {
    int n = 5;
    std::vector<Edge> edges = {
        {0,1,4},{0,2,1},{2,1,-2},{1,3,1},{2,3,5},{3,4,3}
    };
    const long long INF = LLONG_MAX;
    std::vector<long long> dist(n, INF);
    dist[0] = 0;
    for (int i = 1; i < n; ++i) {
        for (auto& e : edges) {
            if (dist[e.u] == INF) continue;
            if (dist[e.u] + e.w < dist[e.v]) dist[e.v] = dist[e.u] + e.w;
        }
    }
    bool cycle = false;
    for (auto& e : edges) {
        if (dist[e.u] != INF && dist[e.u] + e.w < dist[e.v]) { cycle = true; break; }
    }
    if (cycle) std::cout << "Negative cycle detected\\n";
    else {
        std::cout << "Distances from 0:";
        for (long long d : dist) std::cout << " " << d;
        std::cout << "\\n";
    }
    return 0;
}`,

    python: `from math import inf

def bellman_ford(n, edges, src):
    dist = [inf] * n; dist[src] = 0
    for _ in range(n - 1):
        for u, v, w in edges:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
    for u, v, w in edges:
        if dist[u] + w < dist[v]: return None
    return dist

if __name__ == "__main__":
    edges = [(0,1,4),(0,2,1),(2,1,-2),(1,3,1),(2,3,5),(3,4,3)]
    d = bellman_ford(5, edges, 0)
    if d is None: print("Negative cycle detected")
    else: print("Distances from 0:", d)`,

    java: `import java.util.*;

public class Main {
    public static long[] bellmanFord(int n, int[][] edges, int src) {
        long[] dist = new long[n];
        Arrays.fill(dist, Long.MAX_VALUE);
        dist[src] = 0;
        for (int i = 1; i < n; i++) {
            for (int[] e : edges) {
                if (dist[e[0]] == Long.MAX_VALUE) continue;
                if (dist[e[0]] + e[2] < dist[e[1]]) dist[e[1]] = dist[e[0]] + e[2];
            }
        }
        for (int[] e : edges) {
            if (dist[e[0]] != Long.MAX_VALUE && dist[e[0]] + e[2] < dist[e[1]]) return null;
        }
        return dist;
    }

    public static void main(String[] args) {
        int[][] edges = {{0,1,4},{0,2,1},{2,1,-2},{1,3,1},{2,3,5},{3,4,3}};
        long[] d = bellmanFord(5, edges, 0);
        if (d == null) System.out.println("Negative cycle detected");
        else System.out.println("Distances from 0: " + Arrays.toString(d));
    }
}`,

    rust: `fn bellman_ford(n: usize, edges: &[(usize, usize, i64)], src: usize) -> Option<Vec<i64>> {
    let inf = i64::MAX / 4;
    let mut dist = vec![inf; n];
    dist[src] = 0;
    for _ in 0..n.saturating_sub(1) {
        for &(u, v, w) in edges {
            if dist[u] < inf && dist[u] + w < dist[v] { dist[v] = dist[u] + w; }
        }
    }
    for &(u, v, w) in edges {
        if dist[u] < inf && dist[u] + w < dist[v] { return None; }
    }
    Some(dist)
}

fn main() {
    let edges: [(usize, usize, i64); 6] = [
        (0,1,4),(0,2,1),(2,1,-2),(1,3,1),(2,3,5),(3,4,3)
    ];
    match bellman_ford(5, &edges, 0) {
        None => println!("Negative cycle detected"),
        Some(d) => println!("Distances from 0: {:?}", d),
    }
}`,
  },
}

export const DIJKSTRA_SAMPLES = [
  { name: '5-node graph', description: 'Standard weighted digraph — shortest paths from 0', stdin: '', expected: '' },
  { name: 'Chain',        description: 'Linear 0->1->2->3->4 with unit weights',            stdin: '', expected: '' },
]
export const BELLMAN_SAMPLES = [
  { name: 'Negative edge', description: '2→1 weight -2 is fine (no cycle)', stdin: '', expected: '' },
  { name: 'Positive only', description: 'No negative edges — same as Dijkstra', stdin: '', expected: '' },
]
