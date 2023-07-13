LIBDIR=..\src
BUILDDIR=build

CLFLAGS=/std:c++17
LIBS=User32.lib Shell32.lib Version.lib Shlwapi.lib Gdiplus.lib Gdi32.lib Windowsapp.lib

all: create_dir demo

demo: $(BUILDDIR)\demo.exe

$(BUILDDIR)\demo.exe: $(BUILDDIR)\ActiveWindow.obj $(BUILDDIR)\IconCache.obj $(BUILDDIR)\base64.obj $(BUILDDIR)\GdiPlusUtils.obj $(BUILDDIR)\main.obj
	@echo Linking demo.exe
	link /out:$(BUILDDIR)\demo.exe $(BUILDDIR)\*.obj $(LIBS)

$(BUILDDIR)\main.obj: main.cpp
	@echo Building main.cpp for demo
	cl /c /EHsc $(CLFLAGS) /Fo$(BUILDDIR)\ main.cpp

$(BUILDDIR)\ActiveWindow.obj: $(LIBDIR)\ActiveWindow.cpp $(LIBDIR)\ActiveWindow.h
	@echo Building $(LIBDIR)\ActiveWindow.cpp
	cl /c /EHsc $(CLFLAGS) /Fo$(BUILDDIR)\ $(LIBDIR)\ActiveWindow.cpp

$(BUILDDIR)\IconCache.obj: $(LIBDIR)\IconCache.cpp $(LIBDIR)\IconCache.h
	@echo Building $(LIBDIR)\IconCache.cpp
	cl /c /EHsc $(CLFLAGS) /Fo$(BUILDDIR)\ $(LIBDIR)\IconCache.cpp

$(BUILDDIR)\GdiPlusUtils.obj: $(LIBDIR)\GdiPlusUtils.cpp $(LIBDIR)\GdiPlusUtils.h
	@echo Building $(LIBDIR)\GdiPlusUtils.cpp
	cl /c /EHsc $(CLFLAGS) /Fo$(BUILDDIR)\ $(LIBDIR)\GdiPlusUtils.cpp

$(BUILDDIR)\base64.obj: $(LIBDIR)\base64\base64.cpp $(LIBDIR)\base64\base64.h
	@echo Building $(LIBDIR)\base64\base64.cpp
	cl /c /EHsc $(CLFLAGS) /Fo$(BUILDDIR)\ $(LIBDIR)\base64\base64.cpp

create_dir:
	@if not exist $(BUILDDIR) mkdir $(BUILDDIR)

clean:
	@if exist $(BUILDDIR) rmdir /s /q $(BUILDDIR)

run:
	$(BUILDDIR)\demo.exe $(MODE)
