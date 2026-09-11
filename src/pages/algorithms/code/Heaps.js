// Heaps — min-heap sift-up (insert) and sift-down (extract-min).
export const HEAP_INSERT_CODE = {
  pseudo: `function insert(a, v):
    a.push(v)
    i = a.length - 1
    while i > 0 and a[i] < a[(i-1)/2]:   // min-heap
        swap(a[i], a[(i-1)/2])
        i = (i - 1) / 2`,

  c: `#include <stdio.h>

void heap_insert(int *a, int *n, int v) {
    a[(*n)++] = v;
    int i = *n - 1;
    while (i > 0 && a[i] < a[(i - 1) / 2]) {
        int t = a[i]; a[i] = a[(i - 1) / 2]; a[(i - 1) / 2] = t;
        i = (i - 1) / 2;
    }
}

int main(void) {
    int a[16], n = 0;
    int in[] = {5, 3, 8, 1, 9, 2, 7};
    for (int i = 0; i < 7; i++) heap_insert(a, &n, in[i]);
    printf("Heap array:");
    for (int i = 0; i < n; i++) printf(" %d", a[i]);
    printf("\\nMin at root: %d\\n", a[0]);
    return 0;
}`,

  cpp: `#include <iostream>
#include <queue>
#include <vector>
#include <functional>

int main() {
    std::priority_queue<int, std::vector<int>, std::greater<int>> pq;
    for (int v : {5, 3, 8, 1, 9, 2, 7}) pq.push(v);
    std::cout << "Extract order:";
    while (!pq.empty()) { std::cout << " " << pq.top(); pq.pop(); }
    std::cout << "\\n";
    return 0;
}`,

  python: `import heapq

if __name__ == "__main__":
    a = []
    for v in [5, 3, 8, 1, 9, 2, 7]:
        heapq.heappush(a, v)
    print("Heap array:", a)
    order = []
    while a:
        order.append(heapq.heappop(a))
    print("Extract order:", order)`,

  java: `import java.util.PriorityQueue;

public class Main {
    public static void main(String[] args) {
        PriorityQueue<Integer> pq = new PriorityQueue<>();
        for (int v : new int[]{5, 3, 8, 1, 9, 2, 7}) pq.offer(v);
        StringBuilder sb = new StringBuilder("Extract order:");
        while (!pq.isEmpty()) sb.append(" ").append(pq.poll());
        System.out.println(sb);
    }
}`,

  rust: `use std::collections::BinaryHeap;
use std::cmp::Reverse;

fn main() {
    let mut pq: BinaryHeap<Reverse<i32>> = BinaryHeap::new();
    for v in [5, 3, 8, 1, 9, 2, 7] { pq.push(Reverse(v)); }
    let mut order = Vec::new();
    while let Some(Reverse(v)) = pq.pop() { order.push(v); }
    println!("Extract order: {:?}", order);
}`,
}

export const HEAP_INSERT_SAMPLES = [
  { name: 'Mixed 7',    description: 'Push 5,3,8,1,9,2,7 into min-heap',      stdin: '', expected: '' },
  { name: 'Sorted asc', description: 'Push already sorted values',            stdin: '', expected: '' },
  { name: 'Reverse',    description: 'Push descending — max sift-up activity', stdin: '', expected: '' },
]

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

  c: `#include <stdio.h>

void heap_insert(int *a, int *n, int v) {
    a[(*n)++] = v;
    int i = *n - 1;
    while (i > 0 && a[i] < a[(i - 1) / 2]) {
        int t = a[i]; a[i] = a[(i - 1) / 2]; a[(i - 1) / 2] = t;
        i = (i - 1) / 2;
    }
}

int heap_extract_min(int *a, int *n) {
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
}

int main(void) {
    int a[16], n = 0;
    for (int v = 0; v < 7; v++) heap_insert(a, &n, (int[]){5, 3, 8, 1, 9, 2, 7}[v]);
    printf("Extract order:");
    while (n > 0) printf(" %d", heap_extract_min(a, &n));
    printf("\\n");
    return 0;
}`,

  cpp: `#include <iostream>
#include <vector>

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
}

void heap_insert(std::vector<int>& a, int v) {
    a.push_back(v);
    int i = (int)a.size() - 1;
    while (i > 0 && a[i] < a[(i - 1) / 2]) {
        std::swap(a[i], a[(i - 1) / 2]);
        i = (i - 1) / 2;
    }
}

int main() {
    std::vector<int> a;
    for (int v : {5, 3, 8, 1, 9, 2, 7}) heap_insert(a, v);
    std::cout << "Extract order:";
    while (!a.empty()) std::cout << " " << extract_min(a);
    std::cout << "\\n";
    return 0;
}`,

  python: `def sift_up(a, i):
    while i > 0 and a[i] < a[(i - 1) // 2]:
        a[i], a[(i - 1) // 2] = a[(i - 1) // 2], a[i]
        i = (i - 1) // 2

def extract_min(a):
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
    return root

if __name__ == "__main__":
    a = []
    for v in [5, 3, 8, 1, 9, 2, 7]:
        a.append(v); sift_up(a, len(a) - 1)
    out = []
    while a: out.append(extract_min(a))
    print("Extract order:", out)`,

  java: `public class Main {
    static int[] a = new int[16];
    static int size = 0;

    static void heapInsert(int v) {
        a[size++] = v;
        int i = size - 1;
        while (i > 0 && a[i] < a[(i - 1) / 2]) {
            int t = a[i]; a[i] = a[(i - 1) / 2]; a[(i - 1) / 2] = t;
            i = (i - 1) / 2;
        }
    }

    static int extractMin() {
        int root = a[0];
        a[0] = a[--size];
        int i = 0;
        while (true) {
            int l = 2*i + 1, r = 2*i + 2, best = i;
            if (l < size && a[l] < a[best]) best = l;
            if (r < size && a[r] < a[best]) best = r;
            if (best == i) break;
            int t = a[i]; a[i] = a[best]; a[best] = t;
            i = best;
        }
        return root;
    }

    public static void main(String[] args) {
        for (int v : new int[]{5, 3, 8, 1, 9, 2, 7}) heapInsert(v);
        StringBuilder sb = new StringBuilder("Extract order:");
        while (size > 0) sb.append(" ").append(extractMin());
        System.out.println(sb);
    }
}`,

  rust: `fn sift_up(a: &mut Vec<i32>, mut i: usize) {
    while i > 0 && a[i] < a[(i - 1) / 2] {
        a.swap(i, (i - 1) / 2);
        i = (i - 1) / 2;
    }
}

fn extract_min(a: &mut Vec<i32>) -> i32 {
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
}

fn main() {
    let mut a: Vec<i32> = Vec::new();
    for v in [5, 3, 8, 1, 9, 2, 7] { a.push(v); let idx = a.len() - 1; sift_up(&mut a, idx); }
    let mut out = Vec::new();
    while !a.is_empty() { out.push(extract_min(&mut a)); }
    println!("Extract order: {:?}", out);
}`,
}

export const HEAP_EXTRACT_SAMPLES = [
  { name: 'Ordered pull',  description: 'Extract 7 values in sorted order',        stdin: '', expected: '' },
  { name: 'Single',        description: 'Extract sole element',                    stdin: '', expected: '' },
]
