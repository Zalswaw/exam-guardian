# Exam Guardian

Build a web-based CBT (Computer Based Test) wrapper application. The app has two main views: Student (Siswa) and Admin (Pengawas). Use React, Tailwind CSS, and integrate with Supabase for the database and real-time features.

1. Database Schema (Supabase)

tokens: id, token_string, is_active.

exam_sessions: id, student_name, token_used, status.

cheat_logs: id, student_name, timestamp, violation_type (e.g., "Pindah Tab").

2. Admin Dashboard (Halaman Pengawas - /admin)

A clean dashboard to manage and view active tokens.

A "Real-Time Monitoring" section. Use Supabase real-time subscriptions to listen to the cheat_logs table.

When a new log is inserted (e.g., a student switches tabs), display a prominent red alert card with the student's name, time, and violation type. Include an audio chime if possible.

3. Student Portal (Halaman Siswa - /)

Login State: A centered, clean form asking for "Nama Lengkap" and "Token Ujian". Validate the token against the tokens table.

Exam State: Once logged in successfully, hide the login form and display an embedded Google Form using an <iframe src="[https://docs.google.com/forms/](https://docs.google.com/forms/)..." width="100%" height="800px"></iframe>. Use a dummy Google Form link for now.

Anti-Cheat Feature: Implement a visibilitychange event listener on this page. If document.hidden becomes true (meaning the student switched tabs or minimized the browser), immediately insert a record into the cheat_logs table with their name and "Pindah Tab" as the violation type. Also, show a temporary warning modal to the student saying "Peringatan: Anda terdeteksi pindah tab. Pengawas telah dinotifikasi!"

Please make the UI modern, responsive, and use a red/white/gray color scheme for a formal academic feel.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/74b8d4ba-dcaf-41f1-86dd-c0f7b3e85bb5).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
