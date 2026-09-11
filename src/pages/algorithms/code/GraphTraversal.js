// BFS + DFS in 6 languages. Same 6-node graph, so students can compare the
// two traversal orders side by side.
//
//     0 - 1 - 3
//     |   |
//     2 - 4 - 5
export const CODE = {
  bfs: {
    pseudo: `bfs(adj, src):
  visited[..] = false
  queue = [src]
  visited[src] = true
  order = []
  while queue not empty:
    u = queue.pop_front()
    order.push(u)
    for v in adj[u]:
      if not visited[v]:
        visited[v] = true
        queue.push_back(v)
  return order`,

    c: `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define N 6
static int adj[N][N];
static int deg[N];

void add(int u, int v) {
    adj[u][deg[u]++] = v;
    adj[v][deg[v]++] = u;
}

void bfs(int src) {
    char visited[N] = {0};
    int q[N], h = 0, t = 0;
    q[t++] = src; visited[src] = 1;
    printf("BFS from %d:", src);
    while (h < t) {
        int u = q[h++];
        printf(" %d", u);
        for (int i = 0; i < deg[u]; i++) {
            int v = adj[u][i];
            if (!visited[v]) { visited[v] = 1; q[t++] = v; }
        }
    }
    printf("\\n");
}

int main(void) {
    add(0,1); add(0,2); add(1,3); add(1,4); add(2,4); add(4,5);
    bfs(0);
    return 0;
}`,

    cpp: `#include <iostream>
#include <vector>
#include <queue>

std::vector<int> bfs(const std::vector<std::vector<int>>& adj, int src) {
    std::vector<int> order;
    std::vector<char> visited(adj.size(), 0);
    std::queue<int> q;
    q.push(src); visited[src] = 1;
    while (!q.empty()) {
        int u = q.front(); q.pop();
        order.push_back(u);
        for (int v : adj[u]) {
            if (!visited[v]) { visited[v] = 1; q.push(v); }
        }
    }
    return order;
}

int main() {
    std::vector<std::vector<int>> adj(6);
    auto add = [&](int u, int v){ adj[u].push_back(v); adj[v].push_back(u); };
    add(0,1); add(0,2); add(1,3); add(1,4); add(2,4); add(4,5);
    auto order = bfs(adj, 0);
    std::cout << "BFS from 0:";
    for (int x : order) std::cout << " " << x;
    std::cout << "\\n";
    return 0;
}`,

    python: `from collections import deque

def bfs(adj, src):
    visited = [False] * len(adj)
    order = []
    q = deque([src]); visited[src] = True
    while q:
        u = q.popleft()
        order.append(u)
        for v in adj[u]:
            if not visited[v]:
                visited[v] = True
                q.append(v)
    return order

if __name__ == "__main__":
    adj = [[] for _ in range(6)]
    for u, v in [(0,1),(0,2),(1,3),(1,4),(2,4),(4,5)]:
        adj[u].append(v); adj[v].append(u)
    print("BFS from 0:", bfs(adj, 0))`,

    java: `import java.util.*;

public class Main {
    public static List<Integer> bfs(List<List<Integer>> adj, int src) {
        boolean[] visited = new boolean[adj.size()];
        List<Integer> order = new ArrayList<>();
        Deque<Integer> q = new ArrayDeque<>();
        q.add(src); visited[src] = true;
        while (!q.isEmpty()) {
            int u = q.pollFirst();
            order.add(u);
            for (int v : adj.get(u)) {
                if (!visited[v]) { visited[v] = true; q.addLast(v); }
            }
        }
        return order;
    }

    public static void main(String[] args) {
        int N = 6;
        List<List<Integer>> adj = new ArrayList<>();
        for (int i = 0; i < N; i++) adj.add(new ArrayList<>());
        int[][] edges = {{0,1},{0,2},{1,3},{1,4},{2,4},{4,5}};
        for (int[] e : edges) { adj.get(e[0]).add(e[1]); adj.get(e[1]).add(e[0]); }
        System.out.println("BFS from 0: " + bfs(adj, 0));
    }
}`,

    rust: `use std::collections::VecDeque;

fn bfs(adj: &Vec<Vec<usize>>, src: usize) -> Vec<usize> {
    let mut visited = vec![false; adj.len()];
    let mut order = Vec::new();
    let mut q = VecDeque::new();
    q.push_back(src); visited[src] = true;
    while let Some(u) = q.pop_front() {
        order.push(u);
        for &v in &adj[u] {
            if !visited[v] { visited[v] = true; q.push_back(v); }
        }
    }
    order
}

fn main() {
    let n = 6;
    let mut adj: Vec<Vec<usize>> = vec![vec![]; n];
    for (u, v) in [(0,1),(0,2),(1,3),(1,4),(2,4),(4,5)] {
        adj[u].push(v); adj[v].push(u);
    }
    println!("BFS from 0: {:?}", bfs(&adj, 0));
}`,
  },

  dfs: {
    pseudo: `dfs(adj, src):
  visited[..] = false
  order = []
  recurse(src)
  return order

recurse(u):
  visited[u] = true
  order.push(u)
  for v in adj[u]:
    if not visited[v]:
      recurse(v)`,

    c: `#include <stdio.h>
#include <string.h>
#define N 6
static int adj[N][N]; static int deg[N];
static char visited[N];

void add(int u, int v) { adj[u][deg[u]++] = v; adj[v][deg[v]++] = u; }

void dfs(int u) {
    visited[u] = 1;
    printf(" %d", u);
    for (int i = 0; i < deg[u]; i++) {
        int v = adj[u][i];
        if (!visited[v]) dfs(v);
    }
}

int main(void) {
    add(0,1); add(0,2); add(1,3); add(1,4); add(2,4); add(4,5);
    printf("DFS from 0:");
    dfs(0);
    printf("\\n");
    return 0;
}`,

    cpp: `#include <iostream>
#include <vector>

void dfs_rec(int u, const std::vector<std::vector<int>>& adj, std::vector<char>& visited, std::vector<int>& order) {
    visited[u] = 1;
    order.push_back(u);
    for (int v : adj[u]) if (!visited[v]) dfs_rec(v, adj, visited, order);
}

int main() {
    std::vector<std::vector<int>> adj(6);
    auto add = [&](int u, int v){ adj[u].push_back(v); adj[v].push_back(u); };
    add(0,1); add(0,2); add(1,3); add(1,4); add(2,4); add(4,5);

    std::vector<char> visited(6, 0);
    std::vector<int> order;
    dfs_rec(0, adj, visited, order);
    std::cout << "DFS from 0:";
    for (int x : order) std::cout << " " << x;
    std::cout << "\\n";
    return 0;
}`,

    python: `def dfs(adj, src):
    visited = [False] * len(adj)
    order = []
    stack = [src]
    while stack:
        u = stack.pop()
        if visited[u]: continue
        visited[u] = True
        order.append(u)
        for v in reversed(adj[u]):
            if not visited[v]: stack.append(v)
    return order

if __name__ == "__main__":
    adj = [[] for _ in range(6)]
    for u, v in [(0,1),(0,2),(1,3),(1,4),(2,4),(4,5)]:
        adj[u].append(v); adj[v].append(u)
    print("DFS from 0:", dfs(adj, 0))`,

    java: `import java.util.*;

public class Main {
    public static List<Integer> dfs(List<List<Integer>> adj, int src) {
        boolean[] visited = new boolean[adj.size()];
        List<Integer> order = new ArrayList<>();
        Deque<Integer> stack = new ArrayDeque<>();
        stack.push(src);
        while (!stack.isEmpty()) {
            int u = stack.pop();
            if (visited[u]) continue;
            visited[u] = true;
            order.add(u);
            List<Integer> nbrs = adj.get(u);
            for (int i = nbrs.size() - 1; i >= 0; i--) {
                int v = nbrs.get(i);
                if (!visited[v]) stack.push(v);
            }
        }
        return order;
    }

    public static void main(String[] args) {
        int N = 6;
        List<List<Integer>> adj = new ArrayList<>();
        for (int i = 0; i < N; i++) adj.add(new ArrayList<>());
        int[][] edges = {{0,1},{0,2},{1,3},{1,4},{2,4},{4,5}};
        for (int[] e : edges) { adj.get(e[0]).add(e[1]); adj.get(e[1]).add(e[0]); }
        System.out.println("DFS from 0: " + dfs(adj, 0));
    }
}`,

    rust: `fn dfs(adj: &Vec<Vec<usize>>, src: usize) -> Vec<usize> {
    let mut visited = vec![false; adj.len()];
    let mut order = Vec::new();
    let mut stack = vec![src];
    while let Some(u) = stack.pop() {
        if visited[u] { continue; }
        visited[u] = true;
        order.push(u);
        for &v in adj[u].iter().rev() {
            if !visited[v] { stack.push(v); }
        }
    }
    order
}

fn main() {
    let n = 6;
    let mut adj: Vec<Vec<usize>> = vec![vec![]; n];
    for (u, v) in [(0,1),(0,2),(1,3),(1,4),(2,4),(4,5)] {
        adj[u].push(v); adj[v].push(u);
    }
    println!("DFS from 0: {:?}", dfs(&adj, 0));
}`,
  },
}

export const BFS_SAMPLES = [
  { name: '6-node graph', description: 'Undirected graph, start at 0',   stdin: '', expected: '' },
  { name: 'Disconnected', description: 'Two components — only reaches one', stdin: '', expected: '' },
]
export const DFS_SAMPLES = [
  { name: '6-node graph', description: 'Same graph as BFS, compare orders', stdin: '', expected: '' },
  { name: 'Chain',        description: 'Linear graph 0-1-2-3-4-5',          stdin: '', expected: '' },
]
