// LinkedLists — singly linked list: insert at index + reverse (3-pointer).
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

  c: `#include <stdlib.h>

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
}`,

  cpp: `struct Node { int val; Node* next; };

Node* insert_at(Node* head, int idx, int val) {
    Node* n = new Node{val, nullptr};
    if (idx == 0) { n->next = head; return n; }
    Node* cur = head;
    for (int i = 0; i < idx - 1 && cur; ++i) cur = cur->next;
    n->next = cur->next;
    cur->next = n;
    return head;
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
    return head`,

  java: `public class LinkedList {
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
}`,

  rust: `pub struct Node { pub val: i32, pub next: Option<Box<Node>> }

// Insertion into a Box<Node> chain — classic Rust ownership dance.
pub fn insert_at(mut head: Option<Box<Node>>, idx: usize, val: i32) -> Option<Box<Node>> {
    if idx == 0 { return Some(Box::new(Node { val, next: head })); }
    let mut cur = head.as_deref_mut().unwrap();
    for _ in 0..idx - 1 { cur = cur.next.as_deref_mut().unwrap(); }
    let tail = cur.next.take();
    cur.next = Some(Box::new(Node { val, next: tail }));
    head
}`,
}

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

  c: `Node* reverse(Node *head) {
    Node *prev = NULL, *curr = head, *nxt;
    while (curr) {
        nxt = curr->next;      // save
        curr->next = prev;     // flip
        prev = curr;
        curr = nxt;
    }
    return prev;
}`,

  cpp: `Node* reverse(Node* head) {
    Node *prev = nullptr, *curr = head;
    while (curr) {
        Node* nxt = curr->next;
        curr->next = prev;
        prev = curr;
        curr = nxt;
    }
    return prev;
}`,

  python: `def reverse(head):
    prev, curr = None, head
    while curr is not None:
        nxt = curr.next     # save
        curr.next = prev    # flip
        prev = curr
        curr = nxt
    return prev`,

  java: `public static Node reverse(Node head) {
    Node prev = null, curr = head;
    while (curr != null) {
        Node next = curr.next;
        curr.next = prev;
        prev = curr;
        curr = next;
    }
    return prev;
}`,

  rust: `pub fn reverse(mut head: Option<Box<Node>>) -> Option<Box<Node>> {
    let mut prev: Option<Box<Node>> = None;
    while let Some(mut curr) = head {
        head = curr.next.take();   // save
        curr.next = prev;          // flip
        prev = Some(curr);
    }
    prev
}`,
}
