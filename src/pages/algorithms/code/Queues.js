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

  c: `#include <stdbool.h>
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
}`,

  cpp: `#include <queue>
#include <deque>

// std::queue is a container adaptor. Push at back, pop from front — no wrap
// arithmetic exposed to the caller (deque handles it internally).
std::queue<int> q;
q.push(42);
int front = q.front();
q.pop();      // removes, does NOT return`,

  python: `from collections import deque

# deque is a doubly-linked block-list, O(1) at both ends. Use it, not list.
q = deque()
q.append(42)          # enqueue at tail
val = q.popleft()     # dequeue from head`,

  java: `import java.util.ArrayDeque;
import java.util.Queue;

// ArrayDeque backs a circular buffer under the hood — same idea as above.
Queue<Integer> q = new ArrayDeque<>();
q.offer(42);          // enqueue
int val = q.poll();   // dequeue (null if empty; use remove() to throw)`,

  rust: `use std::collections::VecDeque;

// VecDeque is a ring buffer over Vec — offers O(1) push_back / pop_front.
let mut q: VecDeque<i32> = VecDeque::new();
q.push_back(42);              // enqueue
let val = q.pop_front();      // dequeue → Option<i32>`,
}
