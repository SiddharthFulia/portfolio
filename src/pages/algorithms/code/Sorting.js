// Sorting — Bubble, Counting, Quick, Merge, Radix.
// Each algorithm shipped in six languages so a reader can paste-and-run.

export const CODE = {
  bubble: {
    pseudo: `for i = 0 .. n-2:
  swapped = false
  for j = 0 .. n-i-2:
    if a[j] > a[j+1]:
      swap a[j], a[j+1]
      swapped = true
  if not swapped:
    break`,

    c: `#include <stdbool.h>

void bubble_sort(int a[], int n) {
    for (int i = 0; i < n - 1; i++) {
        bool swapped = false;
        for (int j = 0; j < n - i - 1; j++) {
            if (a[j] > a[j + 1]) {
                int t = a[j]; a[j] = a[j + 1]; a[j + 1] = t;
                swapped = true;
            }
        }
        /* Early exit on already-sorted run makes best case O(n). */
        if (!swapped) break;
    }
}`,

    cpp: `#include <vector>
#include <utility>

void bubble_sort(std::vector<int>& a) {
    int n = (int)a.size();
    for (int i = 0; i < n - 1; ++i) {
        bool swapped = false;
        for (int j = 0; j < n - i - 1; ++j) {
            if (a[j] > a[j + 1]) {
                std::swap(a[j], a[j + 1]);
                swapped = true;
            }
        }
        if (!swapped) break; // sorted early, bail
    }
}`,

    python: `def bubble_sort(a):
    n = len(a)
    for i in range(n - 1):
        swapped = False
        for j in range(n - i - 1):
            if a[j] > a[j + 1]:
                a[j], a[j + 1] = a[j + 1], a[j]
                swapped = True
        # If a full pass had no swaps the list is sorted.
        if not swapped:
            break
    return a`,

    java: `public static void bubbleSort(int[] a) {
    int n = a.length;
    for (int i = 0; i < n - 1; i++) {
        boolean swapped = false;
        for (int j = 0; j < n - i - 1; j++) {
            if (a[j] > a[j + 1]) {
                int t = a[j]; a[j] = a[j + 1]; a[j + 1] = t;
                swapped = true;
            }
        }
        if (!swapped) break; // already sorted
    }
}`,

    rust: `pub fn bubble_sort(a: &mut [i32]) {
    let n = a.len();
    for i in 0..n.saturating_sub(1) {
        let mut swapped = false;
        for j in 0..n - i - 1 {
            if a[j] > a[j + 1] {
                a.swap(j, j + 1);
                swapped = true;
            }
        }
        if !swapped { break; } // best case O(n)
    }
}`,
  },

  counting: {
    pseudo: `k = max(a)
count[0..k] = 0
for x in a:
  count[x] += 1
out = 0
for v = 0 .. k:
  while count[v] > 0:
    a[out++] = v
    count[v] -= 1`,

    c: `#include <stdlib.h>
#include <string.h>

// Assumes non-negative keys. k = max(a).
void counting_sort(int a[], int n) {
    if (n <= 0) return;
    int max = a[0];
    for (int i = 1; i < n; i++) if (a[i] > max) max = a[i];
    int* count = (int*)calloc(max + 1, sizeof(int));
    for (int i = 0; i < n; i++) count[a[i]]++;
    int out = 0;
    for (int v = 0; v <= max; v++)
        while (count[v]-- > 0) a[out++] = v;
    free(count);
}`,

    cpp: `#include <vector>
#include <algorithm>

void counting_sort(std::vector<int>& a) {
    if (a.empty()) return;
    int k = *std::max_element(a.begin(), a.end());
    std::vector<int> count(k + 1, 0);
    for (int x : a) count[x]++;
    int out = 0;
    for (int v = 0; v <= k; ++v)
        while (count[v]-- > 0) a[out++] = v;
}`,

    python: `def counting_sort(a):
    if not a:
        return a
    k = max(a)
    count = [0] * (k + 1)
    for x in a:
        count[x] += 1
    # Rewrite in-place from the tally — non-comparative, O(n + k).
    out = 0
    for v in range(k + 1):
        while count[v] > 0:
            a[out] = v
            out += 1
            count[v] -= 1
    return a`,

    java: `public static void countingSort(int[] a) {
    if (a.length == 0) return;
    int max = a[0];
    for (int x : a) if (x > max) max = x;
    int[] count = new int[max + 1];
    for (int x : a) count[x]++;
    int out = 0;
    for (int v = 0; v <= max; v++)
        while (count[v]-- > 0) a[out++] = v;
}`,

    rust: `pub fn counting_sort(a: &mut Vec<u32>) {
    if a.is_empty() { return; }
    let k = *a.iter().max().unwrap() as usize;
    let mut count = vec![0usize; k + 1];
    for &x in a.iter() { count[x as usize] += 1; }
    let mut out = 0;
    // Non-comparative: total work is O(n + k), where k is the value range.
    for v in 0..=k {
        while count[v] > 0 {
            a[out] = v as u32;
            out += 1;
            count[v] -= 1;
        }
    }
}`,
  },

  quick: {
    pseudo: `quicksort(a, lo, hi):
  if lo >= hi:
    return
  pivot = a[hi]
  i = lo - 1
  for j = lo .. hi-1:
    if a[j] < pivot:
      i += 1
      swap a[i], a[j]
  swap a[i+1], a[hi]
  quicksort(a, lo, i)
  quicksort(a, i+2, hi)`,

    c: `static int partition(int a[], int lo, int hi) {
    int pivot = a[hi], i = lo - 1;
    for (int j = lo; j < hi; j++) {
        if (a[j] < pivot) {
            i++;
            int t = a[i]; a[i] = a[j]; a[j] = t;
        }
    }
    int t = a[i + 1]; a[i + 1] = a[hi]; a[hi] = t;
    return i + 1;
}

void quicksort(int a[], int lo, int hi) {
    if (lo >= hi) return;
    int p = partition(a, lo, hi);
    quicksort(a, lo, p - 1);
    quicksort(a, p + 1, hi);
}`,

    cpp: `#include <vector>
#include <utility>

int partition_lomuto(std::vector<int>& a, int lo, int hi) {
    int pivot = a[hi], i = lo - 1;
    for (int j = lo; j < hi; ++j) {
        if (a[j] < pivot) std::swap(a[++i], a[j]);
    }
    std::swap(a[i + 1], a[hi]);
    return i + 1;
}

void quicksort(std::vector<int>& a, int lo, int hi) {
    if (lo >= hi) return;
    int p = partition_lomuto(a, lo, hi);
    quicksort(a, lo, p - 1);
    quicksort(a, p + 1, hi);
}`,

    python: `def quicksort(a, lo=0, hi=None):
    if hi is None:
        hi = len(a) - 1
    if lo >= hi:
        return a
    # Lomuto partition — last element as pivot.
    pivot = a[hi]
    i = lo - 1
    for j in range(lo, hi):
        if a[j] < pivot:
            i += 1
            a[i], a[j] = a[j], a[i]
    a[i + 1], a[hi] = a[hi], a[i + 1]
    p = i + 1
    quicksort(a, lo, p - 1)
    quicksort(a, p + 1, hi)
    return a`,

    java: `public static void quicksort(int[] a, int lo, int hi) {
    if (lo >= hi) return;
    int pivot = a[hi], i = lo - 1;
    for (int j = lo; j < hi; j++) {
        if (a[j] < pivot) {
            i++;
            int t = a[i]; a[i] = a[j]; a[j] = t;
        }
    }
    int t = a[i + 1]; a[i + 1] = a[hi]; a[hi] = t;
    int p = i + 1;
    quicksort(a, lo, p - 1);
    quicksort(a, p + 1, hi);
}`,

    rust: `pub fn quicksort(a: &mut [i32]) {
    let n = a.len();
    if n < 2 { return; }
    // Lomuto partition — last element as pivot.
    let pivot = a[n - 1];
    let mut i = 0;
    for j in 0..n - 1 {
        if a[j] < pivot {
            a.swap(i, j);
            i += 1;
        }
    }
    a.swap(i, n - 1);
    let (left, right) = a.split_at_mut(i);
    quicksort(left);
    quicksort(&mut right[1..]);
}`,
  },

  merge: {
    pseudo: `mergesort(a, lo, hi):
  if hi - lo <= 1: return
  mid = (lo + hi) / 2
  mergesort(a, lo, mid)
  mergesort(a, mid, hi)
  merge into buffer:
    while i < mid and j < hi:
      take smaller of a[i], a[j]
    drain the rest
  copy buffer back into a[lo..hi]`,

    c: `#include <stdlib.h>
#include <string.h>

static void merge(int a[], int lo, int mid, int hi, int buf[]) {
    int i = lo, j = mid, k = 0;
    while (i < mid && j < hi)
        buf[k++] = a[i] <= a[j] ? a[i++] : a[j++];
    while (i < mid) buf[k++] = a[i++];
    while (j < hi)  buf[k++] = a[j++];
    memcpy(a + lo, buf, (hi - lo) * sizeof(int));
}

static void ms(int a[], int lo, int hi, int buf[]) {
    if (hi - lo <= 1) return;
    int mid = lo + (hi - lo) / 2;
    ms(a, lo, mid, buf);
    ms(a, mid, hi, buf);
    merge(a, lo, mid, hi, buf);
}

void mergesort(int a[], int n) {
    int* buf = (int*)malloc(n * sizeof(int));
    ms(a, 0, n, buf);
    free(buf);
}`,

    cpp: `#include <vector>
#include <algorithm>

static void merge_range(std::vector<int>& a, int lo, int mid, int hi) {
    std::vector<int> buf; buf.reserve(hi - lo);
    int i = lo, j = mid;
    while (i < mid && j < hi)
        buf.push_back(a[i] <= a[j] ? a[i++] : a[j++]);
    while (i < mid) buf.push_back(a[i++]);
    while (j < hi)  buf.push_back(a[j++]);
    std::copy(buf.begin(), buf.end(), a.begin() + lo);
}

void mergesort(std::vector<int>& a, int lo, int hi) {
    if (hi - lo <= 1) return;
    int mid = lo + (hi - lo) / 2;
    mergesort(a, lo, mid);
    mergesort(a, mid, hi);
    merge_range(a, lo, mid, hi);
}`,

    python: `def mergesort(a):
    if len(a) <= 1:
        return a
    mid = len(a) // 2
    left  = mergesort(a[:mid])
    right = mergesort(a[mid:])
    # Classic two-pointer merge — stable because we prefer left on tie.
    out, i, j = [], 0, 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            out.append(left[i]); i += 1
        else:
            out.append(right[j]); j += 1
    out.extend(left[i:])
    out.extend(right[j:])
    return out`,

    java: `public static void mergesort(int[] a) {
    int[] buf = new int[a.length];
    ms(a, 0, a.length, buf);
}

private static void ms(int[] a, int lo, int hi, int[] buf) {
    if (hi - lo <= 1) return;
    int mid = lo + (hi - lo) / 2;
    ms(a, lo, mid, buf);
    ms(a, mid, hi, buf);
    int i = lo, j = mid, k = lo;
    while (i < mid && j < hi)
        buf[k++] = a[i] <= a[j] ? a[i++] : a[j++];
    while (i < mid) buf[k++] = a[i++];
    while (j < hi)  buf[k++] = a[j++];
    System.arraycopy(buf, lo, a, lo, hi - lo);
}`,

    rust: `pub fn mergesort(a: &mut [i32]) {
    let n = a.len();
    if n <= 1 { return; }
    let mid = n / 2;
    mergesort(&mut a[..mid]);
    mergesort(&mut a[mid..]);
    // Merge left+right into a temporary buffer, then blit back.
    let mut buf: Vec<i32> = Vec::with_capacity(n);
    let (mut i, mut j) = (0, mid);
    while i < mid && j < n {
        if a[i] <= a[j] { buf.push(a[i]); i += 1; }
        else            { buf.push(a[j]); j += 1; }
    }
    buf.extend_from_slice(&a[i..mid]);
    buf.extend_from_slice(&a[j..n]);
    a.copy_from_slice(&buf);
}`,
  },

  radix: {
    pseudo: `m = max(a)
for exp = 1, 10, 100 .. while exp <= m:
  buckets[0..9] = []
  for x in a:
    buckets[(x / exp) mod 10].push(x)
  flatten buckets back into a`,

    c: `#include <stdlib.h>
#include <string.h>

static int max_arr(int a[], int n) {
    int m = a[0];
    for (int i = 1; i < n; i++) if (a[i] > m) m = a[i];
    return m;
}

void radix_sort(int a[], int n) {
    if (n <= 0) return;
    int m = max_arr(a, n);
    int* tmp = (int*)malloc(n * sizeof(int));
    for (int exp = 1; m / exp > 0; exp *= 10) {
        int count[10] = {0};
        for (int i = 0; i < n; i++) count[(a[i] / exp) % 10]++;
        for (int i = 1; i < 10; i++) count[i] += count[i - 1];
        /* Iterate reverse to keep it stable. */
        for (int i = n - 1; i >= 0; i--)
            tmp[--count[(a[i] / exp) % 10]] = a[i];
        memcpy(a, tmp, n * sizeof(int));
    }
    free(tmp);
}`,

    cpp: `#include <vector>
#include <algorithm>

void radix_sort(std::vector<int>& a) {
    if (a.empty()) return;
    int m = *std::max_element(a.begin(), a.end());
    std::vector<int> tmp(a.size());
    for (int exp = 1; m / exp > 0; exp *= 10) {
        int count[10] = {0};
        for (int x : a) count[(x / exp) % 10]++;
        for (int i = 1; i < 10; ++i) count[i] += count[i - 1];
        // reverse iteration keeps the sort stable
        for (int i = (int)a.size() - 1; i >= 0; --i)
            tmp[--count[(a[i] / exp) % 10]] = a[i];
        a = tmp;
    }
}`,

    python: `def radix_sort(a):
    if not a:
        return a
    m = max(a)
    exp = 1
    while m // exp > 0:
        # Stable bucket pass on digit (x // exp) % 10.
        buckets = [[] for _ in range(10)]
        for x in a:
            buckets[(x // exp) % 10].append(x)
        a = [x for bucket in buckets for x in bucket]
        exp *= 10
    return a`,

    java: `public static void radixSort(int[] a) {
    if (a.length == 0) return;
    int m = a[0];
    for (int x : a) if (x > m) m = x;
    int[] tmp = new int[a.length];
    for (int exp = 1; m / exp > 0; exp *= 10) {
        int[] count = new int[10];
        for (int x : a) count[(x / exp) % 10]++;
        for (int i = 1; i < 10; i++) count[i] += count[i - 1];
        // Reverse pass = stable placement.
        for (int i = a.length - 1; i >= 0; i--)
            tmp[--count[(a[i] / exp) % 10]] = a[i];
        System.arraycopy(tmp, 0, a, 0, a.length);
    }
}`,

    rust: `pub fn radix_sort(a: &mut Vec<u32>) {
    if a.is_empty() { return; }
    let m = *a.iter().max().unwrap();
    let mut exp = 1u32;
    while m / exp > 0 {
        let mut count = [0usize; 10];
        for &x in a.iter() { count[((x / exp) % 10) as usize] += 1; }
        for i in 1..10 { count[i] += count[i - 1]; }
        let mut tmp = vec![0u32; a.len()];
        // reverse iteration → the sort is stable
        for &x in a.iter().rev() {
            let d = ((x / exp) % 10) as usize;
            count[d] -= 1;
            tmp[count[d]] = x;
        }
        *a = tmp;
        // Guard against overflow when max value uses all 10 decimal digits.
        exp = match exp.checked_mul(10) { Some(v) => v, None => break };
    }
}`,
  },
}
