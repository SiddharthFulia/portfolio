// Searching — linear + binary in 6 languages, each a runnable driver.

export const CODE = {
  linear: {
    pseudo: `for i = 0 .. n-1:
  if a[i] == target:
    return i
return -1`,

    c: `#include <stdio.h>

int linear_search(const int a[], int n, int target) {
    for (int i = 0; i < n; i++) {
        if (a[i] == target) return i;
    }
    return -1;
}

int main(void) {
    int a[] = {4, 8, 1, 15, 7, 23, 42, 3};
    int n = sizeof(a) / sizeof(a[0]);
    printf("linear_search(15) = %d\\n", linear_search(a, n, 15));
    printf("linear_search(99) = %d\\n", linear_search(a, n, 99));
    return 0;
}`,

    cpp: `#include <iostream>
#include <vector>

int linear_search(const std::vector<int>& a, int target) {
    for (int i = 0; i < (int)a.size(); ++i) {
        if (a[i] == target) return i;
    }
    return -1;
}

int main() {
    std::vector<int> a = {4, 8, 1, 15, 7, 23, 42, 3};
    std::cout << "linear_search(15) = " << linear_search(a, 15) << "\\n";
    std::cout << "linear_search(99) = " << linear_search(a, 99) << "\\n";
    return 0;
}`,

    python: `def linear_search(a, target):
    for i, x in enumerate(a):
        if x == target:
            return i
    return -1

if __name__ == "__main__":
    a = [4, 8, 1, 15, 7, 23, 42, 3]
    print("linear_search(15) =", linear_search(a, 15))
    print("linear_search(99) =", linear_search(a, 99))`,

    java: `public class Main {
    public static int linearSearch(int[] a, int target) {
        for (int i = 0; i < a.length; i++) {
            if (a[i] == target) return i;
        }
        return -1;
    }
    public static void main(String[] args) {
        int[] a = {4, 8, 1, 15, 7, 23, 42, 3};
        System.out.println("linearSearch(15) = " + linearSearch(a, 15));
        System.out.println("linearSearch(99) = " + linearSearch(a, 99));
    }
}`,

    rust: `fn linear_search(a: &[i32], target: i32) -> Option<usize> {
    a.iter().position(|&x| x == target)
}

fn main() {
    let a = [4, 8, 1, 15, 7, 23, 42, 3];
    println!("linear_search(15) = {:?}", linear_search(&a, 15));
    println!("linear_search(99) = {:?}", linear_search(&a, 99));
}`,
  },

  binary: {
    pseudo: `lo = 0
hi = n - 1
while lo <= hi:
  mid = lo + (hi - lo) / 2
  if a[mid] == target: return mid
  if a[mid] < target:
    lo = mid + 1
  else:
    hi = mid - 1
return -1`,

    c: `#include <stdio.h>

int binary_search(const int a[], int n, int target) {
    int lo = 0, hi = n - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] == target) return mid;
        if (a[mid] < target) lo = mid + 1;
        else                  hi = mid - 1;
    }
    return -1;
}

int main(void) {
    int a[] = {1, 3, 5, 7, 9, 11, 13, 15, 17, 19};
    int n = sizeof(a) / sizeof(a[0]);
    printf("binary_search(11) = %d\\n", binary_search(a, n, 11));
    printf("binary_search(4)  = %d\\n", binary_search(a, n, 4));
    return 0;
}`,

    cpp: `#include <iostream>
#include <vector>

int binary_search_idx(const std::vector<int>& a, int target) {
    int lo = 0, hi = (int)a.size() - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] == target) return mid;
        if (a[mid] < target) lo = mid + 1;
        else                  hi = mid - 1;
    }
    return -1;
}

int main() {
    std::vector<int> a = {1, 3, 5, 7, 9, 11, 13, 15, 17, 19};
    std::cout << "binary_search(11) = " << binary_search_idx(a, 11) << "\\n";
    std::cout << "binary_search(4)  = " << binary_search_idx(a, 4) << "\\n";
    return 0;
}`,

    python: `def binary_search(a, target):
    lo, hi = 0, len(a) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if a[mid] == target: return mid
        if a[mid] < target: lo = mid + 1
        else:               hi = mid - 1
    return -1

if __name__ == "__main__":
    a = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
    print("binary_search(11) =", binary_search(a, 11))
    print("binary_search(4)  =", binary_search(a, 4))`,

    java: `public class Main {
    public static int binarySearch(int[] a, int target) {
        int lo = 0, hi = a.length - 1;
        while (lo <= hi) {
            int mid = lo + (hi - lo) / 2;
            if (a[mid] == target) return mid;
            if (a[mid] < target) lo = mid + 1;
            else                  hi = mid - 1;
        }
        return -1;
    }
    public static void main(String[] args) {
        int[] a = {1, 3, 5, 7, 9, 11, 13, 15, 17, 19};
        System.out.println("binarySearch(11) = " + binarySearch(a, 11));
        System.out.println("binarySearch(4)  = " + binarySearch(a, 4));
    }
}`,

    rust: `fn binary_search(a: &[i32], target: i32) -> Option<usize> {
    let (mut lo, mut hi) = (0i64, a.len() as i64 - 1);
    while lo <= hi {
        let mid = lo + (hi - lo) / 2;
        let v = a[mid as usize];
        if v == target { return Some(mid as usize); }
        if v < target { lo = mid + 1; } else { hi = mid - 1; }
    }
    None
}

fn main() {
    let a = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
    println!("binary_search(11) = {:?}", binary_search(&a, 11));
    println!("binary_search(4)  = {:?}", binary_search(&a, 4));
}`,
  },
}

export const SEARCHING_LINEAR_SAMPLES = [
  { name: 'Found',    description: 'Target 15 is present at index 3',   stdin: '', expected: '' },
  { name: 'Missing',  description: 'Target 99 is not in the array',     stdin: '', expected: '' },
]
export const SEARCHING_BINARY_SAMPLES = [
  { name: 'Found',    description: 'Target 11 in sorted 1..19 (odd)',   stdin: '', expected: '' },
  { name: 'Missing',  description: 'Target 4 not in sorted 1..19 (odd)', stdin: '', expected: '' },
]
