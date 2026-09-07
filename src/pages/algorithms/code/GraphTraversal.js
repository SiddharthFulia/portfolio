// BFS + DFS in 6 languages.

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

    c: `#include <stdlib.h>
#include <string.h>

/* Assumes adjacency stored as head/next/to arrays (CSR-lite). */
void bfs(int n, int src, int* head, int* next, int* to, int* order) {
    char* visited = (char*)calloc(n, 1);
    int* q = (int*)malloc(n * sizeof(int));
    int qh = 0, qt = 0, k = 0;
    q[qt++] = src; visited[src] = 1;
    while (qh < qt) {
        int u = q[qh++];
        order[k++] = u;
        for (int e = head[u]; e != -1; e = next[e]) {
            int v = to[e];
            if (!visited[v]) { visited[v] = 1; q[qt++] = v; }
        }
    }
    free(visited); free(q);
}`,

    cpp: `#include <vector>
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
}`,

    python: `from collections import deque

def bfs(adj, src):
    """adj[u] = list of neighbours. Returns nodes in BFS order."""
    visited = [False] * len(adj)
    order = []
    q = deque([src])
    visited[src] = True
    while q:
        u = q.popleft()
        order.append(u)
        for v in adj[u]:
            if not visited[v]:
                # Mark on enqueue, not on dequeue — prevents duplicates.
                visited[v] = True
                q.append(v)
    return order`,

    java: `import java.util.*;

public static List<Integer> bfs(List<List<Integer>> adj, int src) {
    boolean[] visited = new boolean[adj.size()];
    List<Integer> order = new ArrayList<>();
    Deque<Integer> q = new ArrayDeque<>();
    q.add(src); visited[src] = true;
    while (!q.isEmpty()) {
        int u = q.pollFirst();
        order.add(u);
        for (int v : adj.get(u)) {
            if (!visited[v]) {
                visited[v] = true;
                q.addLast(v);
            }
        }
    }
    return order;
}`,

    rust: `use std::collections::VecDeque;

pub fn bfs(adj: &Vec<Vec<usize>>, src: usize) -> Vec<usize> {
    let mut visited = vec![false; adj.len()];
    let mut order = Vec::with_capacity(adj.len());
    let mut q = VecDeque::new();
    q.push_back(src);
    visited[src] = true;
    while let Some(u) = q.pop_front() {
        order.push(u);
        for &v in &adj[u] {
            if !visited[v] {
                visited[v] = true;   // mark on enqueue to avoid re-visits
                q.push_back(v);
            }
        }
    }
    order
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

    c: `#include <stdlib.h>

static void dfs_rec(int u, int* head, int* next, int* to, char* visited, int* order, int* k) {
    visited[u] = 1;
    order[(*k)++] = u;
    for (int e = head[u]; e != -1; e = next[e]) {
        int v = to[e];
        if (!visited[v]) dfs_rec(v, head, next, to, visited, order, k);
    }
}

void dfs(int n, int src, int* head, int* next, int* to, int* order) {
    char* visited = (char*)calloc(n, 1);
    int k = 0;
    dfs_rec(src, head, next, to, visited, order, &k);
    free(visited);
}`,

    cpp: `#include <vector>

void dfs_rec(int u, const std::vector<std::vector<int>>& adj,
             std::vector<char>& visited, std::vector<int>& order) {
    visited[u] = 1;
    order.push_back(u);
    for (int v : adj[u]) {
        if (!visited[v]) dfs_rec(v, adj, visited, order);
    }
}

std::vector<int> dfs(const std::vector<std::vector<int>>& adj, int src) {
    std::vector<char> visited(adj.size(), 0);
    std::vector<int> order;
    dfs_rec(src, adj, visited, order);
    return order;
}`,

    python: `def dfs(adj, src):
    """Iterative DFS — avoids Python's recursion-depth wall on deep graphs."""
    visited = [False] * len(adj)
    order = []
    stack = [src]
    while stack:
        u = stack.pop()
        if visited[u]:
            continue
        visited[u] = True
        order.append(u)
        # Reverse so neighbours are visited in original order.
        for v in reversed(adj[u]):
            if not visited[v]:
                stack.append(v)
    return order`,

    java: `import java.util.*;

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
        // Reverse to keep neighbour order identical to a recursive DFS.
        for (int i = nbrs.size() - 1; i >= 0; i--) {
            int v = nbrs.get(i);
            if (!visited[v]) stack.push(v);
        }
    }
    return order;
}`,

    rust: `pub fn dfs(adj: &Vec<Vec<usize>>, src: usize) -> Vec<usize> {
    let mut visited = vec![false; adj.len()];
    let mut order = Vec::with_capacity(adj.len());
    // Iterative stack — no risk of blowing Rust's fixed stack on deep graphs.
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
}`,
  },
}
