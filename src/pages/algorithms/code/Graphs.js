// Graphs — adjacency list + matrix representations.
export const GRAPH_CODE = {
  pseudo: `// Adjacency list — map from node to list of neighbours
adj = { u: [(v, w), ...] for u in V }

// Adjacency matrix — V x V grid
M[u][v] = 1  (or w)   if edge exists
        = 0            otherwise`,

  c: `#include <stdio.h>
#include <stdlib.h>
#define V 6

int M[V][V];
typedef struct Edge { int to, w; struct Edge *next; } Edge;
Edge* adj[V];

void add_edge(int u, int v, int w) {
    M[u][v] = w;
    Edge *e = malloc(sizeof(Edge));
    e->to = v; e->w = w; e->next = adj[u];
    adj[u] = e;
}

int main(void) {
    add_edge(0, 1, 5); add_edge(0, 2, 3);
    add_edge(1, 3, 1); add_edge(2, 3, 4);
    add_edge(3, 4, 2); add_edge(4, 5, 6);

    printf("Adjacency list:\\n");
    for (int u = 0; u < V; u++) {
        printf("  %d ->", u);
        for (Edge *e = adj[u]; e; e = e->next) printf(" (%d,w%d)", e->to, e->w);
        printf("\\n");
    }
    printf("Matrix[0][1]=%d  Matrix[3][4]=%d\\n", M[0][1], M[3][4]);
    return 0;
}`,

  cpp: `#include <iostream>
#include <vector>

int main() {
    const int V = 6;
    std::vector<std::vector<std::pair<int,int>>> adj(V);
    std::vector<std::vector<int>> M(V, std::vector<int>(V, 0));

    auto add = [&](int u, int v, int w) {
        adj[u].push_back({v, w});
        M[u][v] = w;
    };
    add(0, 1, 5); add(0, 2, 3);
    add(1, 3, 1); add(2, 3, 4);
    add(3, 4, 2); add(4, 5, 6);

    std::cout << "Adjacency list:\\n";
    for (int u = 0; u < V; u++) {
        std::cout << "  " << u << " ->";
        for (auto [v, w] : adj[u]) std::cout << " (" << v << ",w" << w << ")";
        std::cout << "\\n";
    }
    std::cout << "Matrix[0][1]=" << M[0][1] << "  Matrix[3][4]=" << M[3][4] << "\\n";
    return 0;
}`,

  python: `from collections import defaultdict

if __name__ == "__main__":
    V = 6
    adj = defaultdict(list)
    M = [[0] * V for _ in range(V)]

    def add(u, v, w):
        adj[u].append((v, w)); M[u][v] = w

    for u, v, w in [(0,1,5),(0,2,3),(1,3,1),(2,3,4),(3,4,2),(4,5,6)]:
        add(u, v, w)

    print("Adjacency list:")
    for u in range(V):
        print(f"  {u} ->", adj[u])
    print(f"Matrix[0][1]={M[0][1]}  Matrix[3][4]={M[3][4]}")`,

  java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        final int V = 6;
        List<int[]>[] adj = new List[V];
        for (int i = 0; i < V; i++) adj[i] = new ArrayList<>();
        int[][] M = new int[V][V];

        int[][] edges = {{0,1,5},{0,2,3},{1,3,1},{2,3,4},{3,4,2},{4,5,6}};
        for (int[] e : edges) {
            adj[e[0]].add(new int[]{e[1], e[2]});
            M[e[0]][e[1]] = e[2];
        }

        System.out.println("Adjacency list:");
        for (int u = 0; u < V; u++) {
            StringBuilder sb = new StringBuilder("  " + u + " ->");
            for (int[] e : adj[u]) sb.append(" (").append(e[0]).append(",w").append(e[1]).append(")");
            System.out.println(sb);
        }
        System.out.println("Matrix[0][1]=" + M[0][1] + "  Matrix[3][4]=" + M[3][4]);
    }
}`,

  rust: `struct Graph { adj: Vec<Vec<(usize, i32)>>, m: Vec<Vec<i32>> }

impl Graph {
    fn new(n: usize) -> Self { Self { adj: vec![vec![]; n], m: vec![vec![0; n]; n] } }
    fn add(&mut self, u: usize, v: usize, w: i32) {
        self.adj[u].push((v, w));
        self.m[u][v] = w;
    }
}

fn main() {
    let mut g = Graph::new(6);
    for (u, v, w) in [(0,1,5),(0,2,3),(1,3,1),(2,3,4),(3,4,2),(4,5,6)] {
        g.add(u, v, w);
    }
    println!("Adjacency list:");
    for u in 0..6 { println!("  {} -> {:?}", u, g.adj[u]); }
    println!("Matrix[0][1]={}  Matrix[3][4]={}", g.m[0][1], g.m[3][4]);
}`,
}

export const GRAPH_SAMPLES = [
  { name: 'Weighted DAG',  description: '6 nodes, 6 edges — inspect both reps',   stdin: '', expected: '' },
  { name: 'Sparse',        description: 'Compact graph, only 2 edges',           stdin: '', expected: '' },
]
