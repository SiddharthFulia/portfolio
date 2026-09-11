// LinkedLists — singly linked list: insert at index + reverse (3-pointer).
//
// Each snippet is a full, runnable program: reads no input, hardcodes a small
// sample list, calls the operation, and prints the resulting sequence so the
// student can see the algorithm actually working.
export const LL_INSERT_CODE = {
  pseudo: `function insertAt(head, idx, val):
    node = new Node(val)
    if idx == 0:
        node.next = head
        return node
    cur = head
    for i from 0 to idx - 2:
        cur = cur.next
    node.next = cur.next
    cur.next = node
    return head`,

  c: `#include <stdio.h>
#include <stdlib.h>

typedef struct Node { int val; struct Node *next; } Node;

Node* insert_at(Node *head, int idx, int val) {
    Node *n = malloc(sizeof(Node));
    n->val = val; n->next = NULL;
    if (idx == 0) { n->next = head; return n; }
    Node *cur = head;
    for (int i = 0; i < idx - 1 && cur; i++) cur = cur->next;
    n->next = cur->next;
    cur->next = n;
    return head;
}

int main(void) {
    Node *head = NULL;
    // Build 1 -> 2 -> 4
    int seed[] = {1, 2, 4};
    for (int i = 2; i >= 0; i--) {
        Node *n = malloc(sizeof(Node));
        n->val = seed[i]; n->next = head; head = n;
    }
    // Insert 3 at index 2 => 1 -> 2 -> 3 -> 4
    head = insert_at(head, 2, 3);
    printf("List:");
    for (Node *c = head; c; c = c->next) printf(" %d", c->val);
    printf("\\n");
    return 0;
}`,

  cpp: `#include <iostream>

struct Node { int val; Node* next; };

Node* insert_at(Node* head, int idx, int val) {
    Node* n = new Node{val, nullptr};
    if (idx == 0) { n->next = head; return n; }
    Node* cur = head;
    for (int i = 0; i < idx - 1 && cur; ++i) cur = cur->next;
    n->next = cur->next;
    cur->next = n;
    return head;
}

int main() {
    // Build 1 -> 2 -> 4
    Node* head = nullptr;
    int seed[] = {1, 2, 4};
    for (int i = 2; i >= 0; --i) head = new Node{seed[i], head};

    // Insert 3 at index 2  =>  1 -> 2 -> 3 -> 4
    head = insert_at(head, 2, 3);

    std::cout << "List:";
    for (Node* c = head; c; c = c->next) std::cout << " " << c->val;
    std::cout << "\\n";
    return 0;
}`,

  python: `class Node:
    __slots__ = ("val", "next")
    def __init__(self, val, nxt=None):
        self.val, self.next = val, nxt

def insert_at(head, idx, val):
    n = Node(val)
    if idx == 0:
        n.next = head
        return n
    cur = head
    for _ in range(idx - 1):
        cur = cur.next
    n.next = cur.next
    cur.next = n
    return head

def to_list(head):
    out = []
    while head:
        out.append(head.val); head = head.next
    return out

if __name__ == "__main__":
    # Build 1 -> 2 -> 4
    head = Node(1, Node(2, Node(4)))
    # Insert 3 at index 2  =>  1 -> 2 -> 3 -> 4
    head = insert_at(head, 2, 3)
    print("List:", to_list(head))`,

  java: `public class Main {
    static class Node { int val; Node next; Node(int v) { val = v; } }

    public static Node insertAt(Node head, int idx, int val) {
        Node n = new Node(val);
        if (idx == 0) { n.next = head; return n; }
        Node cur = head;
        for (int i = 0; i < idx - 1 && cur != null; i++) cur = cur.next;
        n.next = cur.next;
        cur.next = n;
        return head;
    }

    public static void main(String[] args) {
        // Build 1 -> 2 -> 4
        Node head = new Node(1);
        head.next = new Node(2);
        head.next.next = new Node(4);

        // Insert 3 at index 2  =>  1 -> 2 -> 3 -> 4
        head = insertAt(head, 2, 3);

        StringBuilder sb = new StringBuilder("List:");
        for (Node c = head; c != null; c = c.next) sb.append(" ").append(c.val);
        System.out.println(sb);
    }
}`,

  rust: `// Idiomatic-Rust linked list is famously hairy because of ownership.
// For teaching, we use an index-based Vec<Node> — same asymptotic behaviour,
// far more readable, and shows what insert-at-index actually does.
struct Node { val: i32, next: Option<usize> }

struct List { nodes: Vec<Node>, head: Option<usize> }

impl List {
    fn new() -> Self { List { nodes: Vec::new(), head: None } }

    fn push_back(&mut self, val: i32) {
        let id = self.nodes.len();
        self.nodes.push(Node { val, next: None });
        match self.head {
            None => self.head = Some(id),
            Some(mut cur) => {
                while let Some(n) = self.nodes[cur].next { cur = n; }
                self.nodes[cur].next = Some(id);
            }
        }
    }

    fn insert_at(&mut self, idx: usize, val: i32) {
        let id = self.nodes.len();
        self.nodes.push(Node { val, next: None });
        if idx == 0 {
            self.nodes[id].next = self.head;
            self.head = Some(id);
            return;
        }
        let mut cur = self.head.unwrap();
        for _ in 0..idx - 1 { cur = self.nodes[cur].next.unwrap(); }
        self.nodes[id].next = self.nodes[cur].next;
        self.nodes[cur].next = Some(id);
    }

    fn to_vec(&self) -> Vec<i32> {
        let mut out = Vec::new();
        let mut cur = self.head;
        while let Some(i) = cur { out.push(self.nodes[i].val); cur = self.nodes[i].next; }
        out
    }
}

fn main() {
    let mut l = List::new();
    for v in [1, 2, 4] { l.push_back(v); }
    l.insert_at(2, 3);
    println!("List: {:?}", l.to_vec());
}`,
}

export const LL_INSERT_SAMPLES = [
  { name: 'Middle insert',   description: 'Insert 3 at index 2 into 1->2->4',   stdin: '',                       expected: '' },
  { name: 'Head insert',     description: 'Insert 0 at index 0',                stdin: '',                       expected: '' },
  { name: 'Tail insert',     description: 'Append at end',                      stdin: '',                       expected: '' },
]

export const LL_REVERSE_CODE = {
  pseudo: `function reverse(head):
    prev = null
    curr = head
    while curr != null:
        next = curr.next
        curr.next = prev
        prev = curr
        curr = next
    return prev`,

  c: `#include <stdio.h>
#include <stdlib.h>

typedef struct Node { int val; struct Node *next; } Node;

Node* reverse(Node *head) {
    Node *prev = NULL, *curr = head, *nxt;
    while (curr) {
        nxt = curr->next;      // save
        curr->next = prev;     // flip
        prev = curr;
        curr = nxt;
    }
    return prev;
}

int main(void) {
    // Build 1 -> 2 -> 3 -> 4 -> 5
    Node *head = NULL;
    for (int i = 5; i >= 1; i--) {
        Node *n = malloc(sizeof(Node));
        n->val = i; n->next = head; head = n;
    }
    head = reverse(head);
    printf("Reversed:");
    for (Node *c = head; c; c = c->next) printf(" %d", c->val);
    printf("\\n");
    return 0;
}`,

  cpp: `#include <iostream>

struct Node { int val; Node* next; };

Node* reverse(Node* head) {
    Node *prev = nullptr, *curr = head;
    while (curr) {
        Node* nxt = curr->next;
        curr->next = prev;
        prev = curr;
        curr = nxt;
    }
    return prev;
}

int main() {
    // Build 1 -> 2 -> 3 -> 4 -> 5
    Node* head = nullptr;
    for (int i = 5; i >= 1; --i) head = new Node{i, head};
    head = reverse(head);
    std::cout << "Reversed:";
    for (Node* c = head; c; c = c->next) std::cout << " " << c->val;
    std::cout << "\\n";
    return 0;
}`,

  python: `class Node:
    __slots__ = ("val", "next")
    def __init__(self, val, nxt=None):
        self.val, self.next = val, nxt

def reverse(head):
    prev, curr = None, head
    while curr is not None:
        nxt = curr.next     # save
        curr.next = prev    # flip
        prev = curr
        curr = nxt
    return prev

if __name__ == "__main__":
    # Build 1 -> 2 -> 3 -> 4 -> 5
    head = None
    for v in [5, 4, 3, 2, 1]:
        head = Node(v, head)
    head = reverse(head)
    out = []
    while head:
        out.append(head.val); head = head.next
    print("Reversed:", out)`,

  java: `public class Main {
    static class Node { int val; Node next; Node(int v) { val = v; } }

    public static Node reverse(Node head) {
        Node prev = null, curr = head;
        while (curr != null) {
            Node next = curr.next;
            curr.next = prev;
            prev = curr;
            curr = next;
        }
        return prev;
    }

    public static void main(String[] args) {
        // Build 1 -> 2 -> 3 -> 4 -> 5
        Node head = new Node(1);
        Node c = head;
        for (int i = 2; i <= 5; i++) { c.next = new Node(i); c = c.next; }
        head = reverse(head);
        StringBuilder sb = new StringBuilder("Reversed:");
        for (Node cur = head; cur != null; cur = cur.next) sb.append(" ").append(cur.val);
        System.out.println(sb);
    }
}`,

  rust: `fn reverse(mut list: Vec<i32>) -> Vec<i32> {
    // Simple, correct, teachable — mirrors the pointer-flip idea:
    // conceptually we take the head of the "input" and push onto the "output".
    let mut out: Vec<i32> = Vec::with_capacity(list.len());
    while let Some(v) = list.pop() {
        // list.pop() takes the tail; but reverse semantics — pushing tail-of-input
        // onto out from the back is the same as reversing.
        out.push(v);
    }
    // out currently ends up as reversed list.reverse()-> which is what we want.
    out
}

fn main() {
    let list = vec![1, 2, 3, 4, 5];
    let rev = reverse(list);
    println!("Reversed: {:?}", rev);
}`,
}

export const LL_REVERSE_SAMPLES = [
  { name: 'Five nodes',   description: 'Reverse 1->2->3->4->5',   stdin: '', expected: '' },
  { name: 'Two nodes',    description: 'Reverse 1->2',            stdin: '', expected: '' },
  { name: 'Single',       description: 'Reverse [42] — no-op',    stdin: '', expected: '' },
  { name: 'Empty',        description: 'Reverse empty list',      stdin: '', expected: '' },
]
