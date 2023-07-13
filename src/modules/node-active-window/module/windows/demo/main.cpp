#include "../src/ActiveWindow.h"
#include <iostream>
#include <windows.h>
#include <processthreadsapi.h>
#include <cstring>

void printWindowInfo(PaymoActiveWindow::WindowInfo* inf) {
	std::wcout<<L"Title: \""<<inf->title<<L"\""<<std::endl;
	std::wcout<<L"Application: \""<<inf->application<<L"\""<<std::endl;
	std::wcout<<L"Path: \""<<inf->path<<L"\""<<std::endl;
	std::cout<<"PID: \""<<inf->pid<<"\""<<std::endl;
	std::cout<<"Is UWP App: "<<(inf->isUWPApp ? "true" : "false")<<std::endl;
	std::wcout<<L"UWP Package name: \""<<inf->uwpPackage<<L"\""<<std::endl;
	std::cout<<"Icon (base64 with viewer): https://systemtest.tk/uploads/d8120932c898c1191bbda1cb6250c3bb#"<<inf->icon<<std::endl;
}

void pollWindowInfo(PaymoActiveWindow::ActiveWindow* aw) {
	std::cout<<"Window currently in foreground:"<<std::endl;

	PaymoActiveWindow::WindowInfo* inf = aw->getActiveWindow();

	if (inf == NULL) {
		std::cout<<"Error: Could not get window info"<<std::endl;
		return;
	}

	printWindowInfo(inf);

	delete inf;
}

double getCpuTime() {
	FILETIME a, b, c, d;
	if (GetProcessTimes(GetCurrentProcess(), &a, &b, &c, &d) != 0) {
		return (double)(d.dwLowDateTime | ((unsigned long long)d.dwHighDateTime << 32)) * 0.0000001;
	}
	else {
		return 0;
	}
}

static volatile bool loop = true;
BOOL WINAPI signalHandler(DWORD signal) {
	if (signal == CTRL_C_EVENT) {
		std::cout<<"Got Ctrl+C"<<std::endl;
		loop = false;
	}

	return true;
}

int main(int argc, char* argv[]) {
	PaymoActiveWindow::ActiveWindow* aw = new PaymoActiveWindow::ActiveWindow(10);

	if (argc < 2) {
		// default mode
		pollWindowInfo(aw);

		std::cout<<"Now sleeping 3 seconds for you to move to another window\n\n\n";
		Sleep(3000);

		pollWindowInfo(aw);
	}
	else if (strcmp(argv[1], "loop") == 0) {
		// infinite loop mode
		std::cout<<"Printing window info in infinite loop. Ctrl+C to exit"<<std::endl;
		SetConsoleCtrlHandler(signalHandler, TRUE);
		while (loop) {
			pollWindowInfo(aw);
			std::cout<<"\n\n\n";
			Sleep(3000);
		}
	}
	else if (strcmp(argv[1], "watch") == 0) {
		// watch mode
		std::cout<<"Running in watch mode. Ctrl+C to exit"<<std::endl;
		SetConsoleCtrlHandler(signalHandler, TRUE);
		PaymoActiveWindow::watch_t watchId = aw->watchActiveWindow([](PaymoActiveWindow::WindowInfo* inf) {
			std::cout<<"[Notif] Active window has changed!\n";

			if (inf == NULL) {
				std::cout<<"Empty"<<std::endl;
				return;
			}

			printWindowInfo(inf);
			std::cout<<"\n\n\n";
		});

		std::cout<<"Set up watch. Id = "<<watchId<<std::endl;

		while (loop) {
			Sleep(1000);
		}

		std::cout<<"Removing watch"<<std::endl;
		aw->unwatchActiveWindow(watchId);
		std::cout<<"Watch removed"<<std::endl;
	}
	else if (strcmp(argv[1], "benchmark") == 0) {
		// benchmark mode
		std::cout<<"Benchmark mode. Will run 10000 iterations and print CPU time"<<std::endl;
		double start = getCpuTime();
		for (int i = 0; i < 10000; i++) {
			PaymoActiveWindow::WindowInfo* inf = aw->getActiveWindow();
			delete inf;
		}
		double end = getCpuTime();

		std::cout<<"Elapsed CPU seconds: "<<(end - start)<<std::endl;
	}
	else {
		std::cout<<"Error: Invalid mode"<<std::endl;
	}

	delete aw;

	return 0;
}
