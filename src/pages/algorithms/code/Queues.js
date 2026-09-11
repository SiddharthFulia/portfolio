// Queues — circular buffer with head / tail wrap-around.
export const QUEUE_CODE = {
  pseudo: `function enqueue(v):
    if size == CAP: return FULL
    buf[tail] = v
    tail = (tail + 1) mod CAP
    size += 1

function dequeue():
    if size == 0: return EMPTY
    v = buf[head]
    head = (head + 1) mod CAP
    size -= 1
    return v`,

  c: `#include <stdio.h>
#include <stdbool.h>
#define CAP 8

typedef struct { int buf[CAP]; int head, tail, size; } Queue;

bool enqueue(Queue *q, int v) {
    if (q->size == CAP) return false;
    q->buf[q->tail] = v;
    q->tail = (q->tail + 1) % CAP;
    q->size++;
    return true;
}
int dequeue(Queue *q) {
    int v = q->buf[q->head];
    q->head = (q->head + 1) % CAP;
    q->size--;
    return v;
}

int main(void) {
    Queue q = {0};
    for (int i = 1; i <= 5; i++) enqueue(&q, i * 10);
    printf("Dequeued:");
    while (q.size) printf(" %d", dequeue(&q));
    printf("\\n");
    return 0;
}`,

  cpp: `#include <iostream>
#include <queue>

int main() {
    std::queue<int> q;
    for (int i = 1; i <= 5; i++) q.push(i * 10);
    std::cout << "Dequeued:";
    while (!q.empty()) { std::cout << " " << q.front(); q.pop(); }
    std::cout << "\\n";
    return 0;
}`,

  python: `from collections import deque

if __name__ == "__main__":
    q = deque()
    for i in range(1, 6):
        q.append(i * 10)              # enqueue at tail
    out = []
    while q:
        out.append(q.popleft())       # dequeue from head
    print("Dequeued:", out)`,

  java: `import java.util.ArrayDeque;
import java.util.Queue;

public class Main {
    public static void main(String[] args) {
        Queue<Integer> q = new ArrayDeque<>();
        for (int i = 1; i <= 5; i++) q.offer(i * 10);
        StringBuilder sb = new StringBuilder("Dequeued:");
        while (!q.isEmpty()) sb.append(" ").append(q.poll());
        System.out.println(sb);
    }
}`,

  rust: `use std::collections::VecDeque;

fn main() {
    let mut q: VecDeque<i32> = VecDeque::new();
    for i in 1..=5 { q.push_back(i * 10); }
    let mut out: Vec<i32> = Vec::new();
    while let Some(v) = q.pop_front() { out.push(v); }
    println!("Dequeued: {:?}", out);
}`,
}

export const QUEUE_SAMPLES = [
  { name: 'FIFO 10..50', description: 'Enqueue 10,20,30,40,50 — dequeue same order', stdin: '', expected: '' },
  { name: 'Empty',       description: 'Dequeue on empty is safe / no-op',            stdin: '', expected: '' },
]
