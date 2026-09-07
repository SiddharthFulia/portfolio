// Graphs — adjacency list + matrix representations.
export const GRAPH_CODE = {
  pseudo: `// Adjacency list — map from node to list of neighbours
adj = { u: [(v, w), ...] for u in V }

// Adjacency matrix — V x V grid
M[u][v] = 1  (or w)   if edge exists
        = 0            otherwise`,

  c: `#include <stdlib.h>
#define V 6

// Adjacency matrix (dense) — best when the graph is dense or V is small.
int M[V][V];   // M[u][v] = weight, 0 = no edge

// Adjacency list (sparse) — one linked list of neighbours per node.
typedef struct Edge { int to, w; struct Edge *next; } Edge;
Edge* adj[V];

void add_edge(int u, int v, int w) {
    M[u][v] = w;                          // matrix side
    Edge *e = malloc(sizeof(Edge));
    e->to = v; e->w = w; e->next = adj[u];
    adj[u] = e;                           // list side (push at head)
}`,

  cpp: `#include <vector>

// Adjacency list — vector of vectors of (neighbour, weight).
std::vector<std::vector<std::pair<int,int>>> adj(V);

// Adjacency matrix — V x V grid, 0 for absent.
std::vector<std::vector<int>> M(V, std::vector<int>(V, 0));

void add_edge(int u, int v, int w) {
    adj[u].push_back({v, w});
    M[u][v] = w;
}`,

  python: `from collections import defaultdict

V = 6

# Adjacency list — dict of lists of (neighbour, weight)
adj: dict[int, list[tuple[int, int]]] = defaultdict(list)

# Adjacency matrix — nested list, 0 for absent
M = [[0] * V for _ in range(V)]

def add_edge(u: int, v: int, w: int = 1) -> None:
    adj[u].append((v, w))
    M[u][v] = w`,

  java: `import java.util.*;

public class Graph {
    static final int V = 6;
    // Adjacency list — array of ArrayLists of int[]{to, weight}
    List<int[]>[] adj = new List[V];
    // Adjacency matrix — dense V x V
    int[][] M = new int[V][V];

    public Graph() {
        for (int i = 0; i < V; i++) adj[i] = new ArrayList<>();
    }

    public void addEdge(int u, int v, int w) {
        adj[u].add(new int[]{v, w});
        M[u][v] = w;
    }
}`,

  rust: `pub struct Graph {
    pub adj: Vec<Vec<(usize, i32)>>,   // list of (neighbour, weight)
    pub m:   Vec<Vec<i32>>,            // dense matrix
}

impl Graph {
    pub fn new(n: usize) -> Self {
        Self { adj: vec![vec![]; n], m: vec![vec![0; n]; n] }
    }
    pub fn add_edge(&mut self, u: usize, v: usize, w: i32) {
        self.adj[u].push((v, w));
        self.m[u][v] = w;
    }
}`,
}
