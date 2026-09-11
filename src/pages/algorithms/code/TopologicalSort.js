// Topological sort — Kahn's (BFS on in-degree) and DFS post-order.
// Sample DAG (course prereqs):
//   0->1, 0->2, 1->3, 2->3, 3->4  (linear tail after diamond)

export const CODE = {
  kahn: {
    pseudo: `kahn(adj, n):
  indeg[u] = number of edges into u
  queue = { u : indeg[u] == 0 }
  order = []
  while queue not empty:
    u = queue.pop_front()
    order.push(u)
    for v in adj[u]:
      indeg[v] -= 1
      if indeg[v] == 0:
        queue.push_back(v)
  if |order| < n:
    return "cycle"
  return order`,

    c: `#include <stdio.h>
#include <string.h>
#define N 5

int main(void) {
    int adj[N][N] = {0};
    int deg_out[N] = {0};
    int edges[][2] = {{0,1},{0,2},{1,3},{2,3},{3,4}};
    for (int i = 0; i < 5; i++) {
        int u = edges[i][0], v = edges[i][1];
        adj[u][deg_out[u]++] = v;
    }
    int indeg[N] = {0};
    for (int u = 0; u < N; u++)
        for (int i = 0; i < deg_out[u]; i++) indeg[adj[u][i]]++;

    int q[N], h = 0, t = 0;
    for (int u = 0; u < N; u++) if (indeg[u] == 0) q[t++] = u;
    printf("Topo (Kahn):");
    while (h < t) {
        int u = q[h++];
        printf(" %d", u);
        for (int i = 0; i < deg_out[u]; i++) {
            int v = adj[u][i];
            if (--indeg[v] == 0) q[t++] = v;
        }
    }
    printf("\\n");
    return 0;
}`,

    cpp: `#include <iostream>
#include <vector>
#include <queue>

std::vector<int> kahn(const std::vector<std::vector<int>>& adj) {
    int n = (int)adj.size();
    std::vector<int> indeg(n, 0);
    for (int u = 0; u < n; ++u) for (int v : adj[u]) indeg[v]++;
    std::queue<int> q;
    for (int u = 0; u < n; ++u) if (indeg[u] == 0) q.push(u);
    std::vector<int> order;
    while (!q.empty()) {
        int u = q.front(); q.pop();
        order.push_back(u);
        for (int v : adj[u]) if (--indeg[v] == 0) q.push(v);
    }
    return order;
}

int main() {
    std::vector<std::vector<int>> adj(5);
    int edges[][2] = {{0,1},{0,2},{1,3},{2,3},{3,4}};
    for (auto& e : edges) adj[e[0]].push_back(e[1]);
    auto order = kahn(adj);
    std::cout << "Topo (Kahn):";
    for (int u : order) std::cout << " " << u;
    std::cout << "\\n";
    return 0;
}`,

    python: `from collections import deque

def kahn(adj):
    n = len(adj)
    indeg = [0] * n
    for u in range(n):
        for v in adj[u]: indeg[v] += 1
    q = deque(u for u in range(n) if indeg[u] == 0)
    order = []
    while q:
        u = q.popleft()
        order.append(u)
        for v in adj[u]:
            indeg[v] -= 1
            if indeg[v] == 0: q.append(v)
    return order if len(order) == n else None

if __name__ == "__main__":
    adj = [[] for _ in range(5)]
    for u, v in [(0,1),(0,2),(1,3),(2,3),(3,4)]:
        adj[u].append(v)
    print("Topo (Kahn):", kahn(adj))`,

    java: `import java.util.*;

public class Main {
    public static List<Integer> kahn(List<List<Integer>> adj) {
        int n = adj.size();
        int[] indeg = new int[n];
        for (int u = 0; u < n; u++) for (int v : adj.get(u)) indeg[v]++;
        Deque<Integer> q = new ArrayDeque<>();
        for (int u = 0; u < n; u++) if (indeg[u] == 0) q.add(u);
        List<Integer> order = new ArrayList<>();
        while (!q.isEmpty()) {
            int u = q.pollFirst();
            order.add(u);
            for (int v : adj.get(u)) if (--indeg[v] == 0) q.addLast(v);
        }
        return order;
    }

    public static void main(String[] args) {
        int N = 5;
        List<List<Integer>> adj = new ArrayList<>();
        for (int i = 0; i < N; i++) adj.add(new ArrayList<>());
        int[][] edges = {{0,1},{0,2},{1,3},{2,3},{3,4}};
        for (int[] e : edges) adj.get(e[0]).add(e[1]);
        System.out.println("Topo (Kahn): " + kahn(adj));
    }
}`,

    rust: `use std::collections::VecDeque;

fn kahn(adj: &Vec<Vec<usize>>) -> Option<Vec<usize>> {
    let n = adj.len();
    let mut indeg = vec![0usize; n];
    for u in 0..n { for &v in &adj[u] { indeg[v] += 1; } }
    let mut q: VecDeque<usize> = (0..n).filter(|&u| indeg[u] == 0).collect();
    let mut order = Vec::with_capacity(n);
    while let Some(u) = q.pop_front() {
        order.push(u);
        for &v in &adj[u] {
            indeg[v] -= 1;
            if indeg[v] == 0 { q.push_back(v); }
        }
    }
    if order.len() == n { Some(order) } else { None }
}

fn main() {
    let n = 5;
    let mut adj: Vec<Vec<usize>> = vec![vec![]; n];
    for (u, v) in [(0,1),(0,2),(1,3),(2,3),(3,4)] { adj[u].push(v); }
    println!("Topo (Kahn): {:?}", kahn(&adj));
}`,
  },

  dfs: {
    pseudo: `dfs_toposort(adj, n):
  color = [WHITE, WHITE, ..]
  order = []
  for u in 0..n:
    if color[u] == WHITE:
      if not visit(u):
        return "cycle"
  reverse order
  return order

visit(u):
  color[u] = GRAY
  for v in adj[u]:
    if color[v] == GRAY: return false
    if color[v] == WHITE and not visit(v): return false
  color[u] = BLACK
  order.push(u)
  return true`,

    c: `#include <stdio.h>
#include <stdlib.h>
#define N 5

static int adj[N][N]; static int deg_out[N];
enum { WHITE = 0, GRAY = 1, BLACK = 2 };
static int color[N];
static int order[N]; static int k;

static int visit(int u) {
    color[u] = GRAY;
    for (int i = 0; i < deg_out[u]; i++) {
        int v = adj[u][i];
        if (color[v] == GRAY) return 1;
        if (color[v] == WHITE && visit(v)) return 1;
    }
    color[u] = BLACK;
    order[k++] = u;
    return 0;
}

int main(void) {
    int edges[][2] = {{0,1},{0,2},{1,3},{2,3},{3,4}};
    for (int i = 0; i < 5; i++) {
        int u = edges[i][0]; adj[u][deg_out[u]++] = edges[i][1];
    }
    for (int u = 0; u < N; u++) if (color[u] == WHITE && visit(u)) { printf("cycle\\n"); return 0; }
    printf("Topo (DFS):");
    for (int i = k - 1; i >= 0; i--) printf(" %d", order[i]);
    printf("\\n");
    return 0;
}`,

    cpp: `#include <iostream>
#include <vector>
#include <algorithm>

enum { WHITE = 0, GRAY = 1, BLACK = 2 };

bool visit(int u, const std::vector<std::vector<int>>& adj, std::vector<int>& color, std::vector<int>& order) {
    color[u] = GRAY;
    for (int v : adj[u]) {
        if (color[v] == GRAY) return false;
        if (color[v] == WHITE && !visit(v, adj, color, order)) return false;
    }
    color[u] = BLACK;
    order.push_back(u);
    return true;
}

int main() {
    std::vector<std::vector<int>> adj(5);
    int edges[][2] = {{0,1},{0,2},{1,3},{2,3},{3,4}};
    for (auto& e : edges) adj[e[0]].push_back(e[1]);
    std::vector<int> color(5, WHITE), order;
    for (int u = 0; u < 5; u++)
        if (color[u] == WHITE && !visit(u, adj, color, order)) { std::cout << "cycle\\n"; return 0; }
    std::reverse(order.begin(), order.end());
    std::cout << "Topo (DFS):";
    for (int u : order) std::cout << " " << u;
    std::cout << "\\n";
    return 0;
}`,

    python: `def dfs_toposort(adj):
    n = len(adj)
    WHITE, GRAY, BLACK = 0, 1, 2
    color = [WHITE] * n
    order = []
    def visit(u):
        color[u] = GRAY
        for v in adj[u]:
            if color[v] == GRAY: return False
            if color[v] == WHITE and not visit(v): return False
        color[u] = BLACK
        order.append(u)
        return True
    for u in range(n):
        if color[u] == WHITE and not visit(u): return None
    order.reverse()
    return order

if __name__ == "__main__":
    adj = [[] for _ in range(5)]
    for u, v in [(0,1),(0,2),(1,3),(2,3),(3,4)]:
        adj[u].append(v)
    print("Topo (DFS):", dfs_toposort(adj))`,

    java: `import java.util.*;

public class Main {
    static boolean visit(int u, List<List<Integer>> adj, int[] color, List<Integer> order) {
        color[u] = 1;
        for (int v : adj.get(u)) {
            if (color[v] == 1) return false;
            if (color[v] == 0 && !visit(v, adj, color, order)) return false;
        }
        color[u] = 2;
        order.add(u);
        return true;
    }

    public static List<Integer> dfsToposort(List<List<Integer>> adj) {
        int n = adj.size();
        int[] color = new int[n];
        List<Integer> order = new ArrayList<>();
        for (int u = 0; u < n; u++)
            if (color[u] == 0 && !visit(u, adj, color, order)) return null;
        Collections.reverse(order);
        return order;
    }

    public static void main(String[] args) {
        int N = 5;
        List<List<Integer>> adj = new ArrayList<>();
        for (int i = 0; i < N; i++) adj.add(new ArrayList<>());
        int[][] edges = {{0,1},{0,2},{1,3},{2,3},{3,4}};
        for (int[] e : edges) adj.get(e[0]).add(e[1]);
        System.out.println("Topo (DFS): " + dfsToposort(adj));
    }
}`,

    rust: `fn dfs_toposort(adj: &Vec<Vec<usize>>) -> Option<Vec<usize>> {
    let n = adj.len();
    let mut color = vec![0u8; n];
    let mut order: Vec<usize> = Vec::with_capacity(n);
    fn visit(u: usize, adj: &Vec<Vec<usize>>, color: &mut [u8], order: &mut Vec<usize>) -> bool {
        color[u] = 1;
        for &v in &adj[u] {
            if color[v] == 1 { return false; }
            if color[v] == 0 && !visit(v, adj, color, order) { return false; }
        }
        color[u] = 2;
        order.push(u);
        true
    }
    for u in 0..n {
        if color[u] == 0 && !visit(u, adj, &mut color, &mut order) { return None; }
    }
    order.reverse();
    Some(order)
}

fn main() {
    let n = 5;
    let mut adj: Vec<Vec<usize>> = vec![vec![]; n];
    for (u, v) in [(0,1),(0,2),(1,3),(2,3),(3,4)] { adj[u].push(v); }
    println!("Topo (DFS): {:?}", dfs_toposort(&adj));
}`,
  },
}

export const KAHN_SAMPLES = [
  { name: 'Diamond DAG', description: 'Course-prereq style — 5 tasks, 5 edges', stdin: '', expected: '' },
  { name: 'Chain',       description: 'Linear 0->1->2->3->4',                    stdin: '', expected: '' },
]
export const DFS_TOPO_SAMPLES = KAHN_SAMPLES
