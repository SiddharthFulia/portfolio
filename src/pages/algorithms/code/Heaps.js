// Heaps — min-heap sift-up (insert) and sift-down (extract-min).
export const HEAP_INSERT_CODE = {
  pseudo: `function insert(a, v):
    a.push(v)
    i = a.length - 1
    while i > 0 and a[i] < a[(i-1)/2]:   // min-heap
        swap(a[i], a[(i-1)/2])
        i = (i - 1) / 2`,

  c: `#include <stdlib.h>

void heap_insert(int *a, int *n, int v) {
    a[(*n)++] = v;
    int i = *n - 1;
    while (i > 0 && a[i] < a[(i - 1) / 2]) {
        int t = a[i]; a[i] = a[(i - 1) / 2]; a[(i - 1) / 2] = t;
        i = (i - 1) / 2;
    }
}`,

  cpp: `#include <queue>
#include <vector>
#include <functional>

// std::priority_queue defaults to a max-heap. Pass std::greater for min.
std::priority_queue<int, std::vector<int>, std::greater<int>> pq;
pq.push(42);
int top = pq.top();    // peek min
pq.pop();`,

  python: `import heapq

# heapq operates on a plain list, min-heap semantics.
a: list[int] = []
heapq.heappush(a, 42)    # sift-up
smallest = a[0]          # peek
heapq.heappop(a)         # sift-down`,

  java: `import java.util.PriorityQueue;

// PriorityQueue is a binary min-heap by default (natural ordering).
PriorityQueue<Integer> pq = new PriorityQueue<>();
pq.offer(42);            // sift-up
int min = pq.peek();
pq.poll();               // sift-down`,

  rust: `use std::collections::BinaryHeap;
use std::cmp::Reverse;

// BinaryHeap is a max-heap; wrap in Reverse for a min-heap.
let mut pq: BinaryHeap<Reverse<i32>> = BinaryHeap::new();
pq.push(Reverse(42));
let Reverse(top) = *pq.peek().unwrap();
pq.pop();`,
}

export const HEAP_EXTRACT_CODE = {
  pseudo: `function extractMin(a):
    root = a[0]
    a[0] = a.pop()
    i = 0
    while true:
        l = 2*i + 1;  r = 2*i + 2;  best = i
        if l < len(a) and a[l] < a[best]: best = l
        if r < len(a) and a[r] < a[best]: best = r
        if best == i: break
        swap(a[i], a[best]);  i = best
    return root`,

  c: `int heap_extract_min(int *a, int *n) {
    int root = a[0];
    a[0] = a[--(*n)];
    int i = 0;
    while (1) {
        int l = 2*i + 1, r = 2*i + 2, best = i;
        if (l < *n && a[l] < a[best]) best = l;
        if (r < *n && a[r] < a[best]) best = r;
        if (best == i) break;
        int t = a[i]; a[i] = a[best]; a[best] = t;
        i = best;
    }
    return root;
}`,

  cpp: `#include <vector>

int extract_min(std::vector<int>& a) {
    int root = a[0];
    a[0] = a.back(); a.pop_back();
    int i = 0, n = (int)a.size();
    while (true) {
        int l = 2*i + 1, r = 2*i + 2, best = i;
        if (l < n && a[l] < a[best]) best = l;
        if (r < n && a[r] < a[best]) best = r;
        if (best == i) break;
        std::swap(a[i], a[best]);
        i = best;
    }
    return root;
}`,

  python: `def extract_min(a: list[int]) -> int:
    root = a[0]
    a[0] = a.pop()
    i, n = 0, len(a)
    while True:
        l, r, best = 2*i + 1, 2*i + 2, i
        if l < n and a[l] < a[best]: best = l
        if r < n and a[r] < a[best]: best = r
        if best == i: break
        a[i], a[best] = a[best], a[i]
        i = best
    return root`,

  java: `public static int extractMin(int[] a, int[] size) {
    int root = a[0];
    a[0] = a[--size[0]];
    int i = 0, n = size[0];
    while (true) {
        int l = 2*i + 1, r = 2*i + 2, best = i;
        if (l < n && a[l] < a[best]) best = l;
        if (r < n && a[r] < a[best]) best = r;
        if (best == i) break;
        int t = a[i]; a[i] = a[best]; a[best] = t;
        i = best;
    }
    return root;
}`,

  rust: `pub fn extract_min(a: &mut Vec<i32>) -> i32 {
    let root = a[0];
    let last = a.pop().unwrap();
    if !a.is_empty() { a[0] = last; }
    let n = a.len();
    let mut i = 0;
    loop {
        let (l, r) = (2*i + 1, 2*i + 2);
        let mut best = i;
        if l < n && a[l] < a[best] { best = l; }
        if r < n && a[r] < a[best] { best = r; }
        if best == i { break; }
        a.swap(i, best);
        i = best;
    }
    root
}`,
}
