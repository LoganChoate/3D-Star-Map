// Bounded process-tree-only WASAPI recording for acceptance diagnostics.
// API references: Microsoft Windows-classic-samples/Samples/ApplicationLoopback
// and WinSDK audioclientactivationparams.h. No microphone/system-mix fallback.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <audioclient.h>
#include <mmdeviceapi.h>
#include <wrl.h>
#include <fstream>
#include <vector>
#include <iostream>
#include <iomanip>
#include <stdexcept>
#include <cstdint>
using namespace Microsoft::WRL;
struct Handle { HANDLE h=nullptr; ~Handle(){if(h&&h!=INVALID_HANDLE_VALUE)CloseHandle(h);} };
static void ok(HRESULT h){if(FAILED(h))throw h;}
static double wallMs(){FILETIME f;GetSystemTimePreciseAsFileTime(&f);ULARGE_INTEGER u;u.LowPart=f.dwLowDateTime;u.HighPart=f.dwHighDateTime;return (u.QuadPart-116444736000000000ULL)/10000.0;}
static double qpc100ns(){LARGE_INTEGER q,f;QueryPerformanceCounter(&q);QueryPerformanceFrequency(&f);return double(q.QuadPart)*10000000.0/double(f.QuadPart);}
// SDK 19041 can compile these ABI-stable Windows 20348 activation parameters.
struct ProcessActivation {DWORD type=1;DWORD pid=0;DWORD mode=0;};
static_assert(sizeof(ProcessActivation)==12,"Unexpected activation ABI");
class Activation final : public RuntimeClass<RuntimeClassFlags<ClassicCom>,FtmBase,IActivateAudioInterfaceCompletionHandler>{
public:
 Handle done; HRESULT result=E_PENDING; ComPtr<IAudioClient> client;
 Activation(){done.h=CreateEventW(nullptr,FALSE,FALSE,nullptr);}
 STDMETHOD(ActivateCompleted)(IActivateAudioInterfaceAsyncOperation* operation) override {
  ComPtr<IUnknown> activatedInterface;HRESULT activated=E_FAIL;result=operation->GetActivateResult(&activated,&activatedInterface);
  if(SUCCEEDED(result))result=activated;if(SUCCEEDED(result))result=activatedInterface.As(&client);SetEvent(done.h);return S_OK;
 }
};
static void number(std::ofstream& o,uint32_t v){o.write(reinterpret_cast<char*>(&v),4);}
static void shortNumber(std::ofstream& o,uint16_t v){o.write(reinterpret_cast<char*>(&v),2);}
int wmain(int argc,wchar_t** argv){
 if(argc!=5){std::cerr<<"Usage: capture.exe PID output.wav stop-file maximum-seconds\n";return 2;}
 const DWORD pid=wcstoul(argv[1],nullptr,10);const int seconds=_wtoi(argv[4]);
 if(!pid||seconds<5||seconds>120){std::cerr<<"Invalid bounded capture arguments\n";return 2;}
 if(GetFileAttributesW(argv[2])!=INVALID_FILE_ATTRIBUTES||GetFileAttributesW(argv[3])!=INVALID_FILE_ATTRIBUTES){std::cerr<<"Use fresh output and stop-file paths\n";return 2;}
 try{
  ok(CoInitializeEx(nullptr,COINIT_MULTITHREADED));Handle process;process.h=OpenProcess(SYNCHRONIZE,FALSE,pid);if(!process.h)throw HRESULT_FROM_WIN32(GetLastError());
  auto activation=Make<Activation>();if(!activation->done.h)throw HRESULT_FROM_WIN32(GetLastError());
  ProcessActivation input;input.pid=pid;PROPVARIANT params={};params.vt=VT_BLOB;params.blob.cbSize=sizeof(input);params.blob.pBlobData=reinterpret_cast<BYTE*>(&input);
  ComPtr<IActivateAudioInterfaceAsyncOperation> operation;
  ok(ActivateAudioInterfaceAsync(L"VAD\\Process_Loopback",__uuidof(IAudioClient),&params,activation.Get(),&operation));
  if(WaitForSingleObject(activation->done.h,10000)!=WAIT_OBJECT_0)throw HRESULT_FROM_WIN32(ERROR_TIMEOUT);ok(activation->result);
  auto client=activation->client;WAVEFORMATEX format={};format.wFormatTag=WAVE_FORMAT_PCM;format.nChannels=2;format.nSamplesPerSec=44100;format.wBitsPerSample=16;format.nBlockAlign=4;format.nAvgBytesPerSec=176400;
  ok(client->Initialize(AUDCLNT_SHAREMODE_SHARED,AUDCLNT_STREAMFLAGS_LOOPBACK|AUDCLNT_STREAMFLAGS_EVENTCALLBACK|AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM,0,0,&format,nullptr));
  Handle samples;samples.h=CreateEventW(nullptr,FALSE,FALSE,nullptr);if(!samples.h)throw HRESULT_FROM_WIN32(GetLastError());ok(client->SetEventHandle(samples.h));
  ComPtr<IAudioCaptureClient> capture;ok(client->GetService(IID_PPV_ARGS(&capture)));
  std::ofstream wav(argv[2],std::ios::binary);if(!wav)throw E_FAIL;
  wav.write("RIFF",4);number(wav,0);wav.write("WAVEfmt ",8);number(wav,16);shortNumber(wav,1);shortNumber(wav,2);number(wav,44100);number(wav,176400);shortNumber(wav,4);shortNumber(wav,16);wav.write("data",4);number(wav,0);
  std::wstring metadata=std::wstring(argv[2])+L".json";std::ofstream meta(metadata);if(!meta)throw E_FAIL;
  const double originWall=wallMs(),originQpc=qpc100ns();const ULONGLONG tick=GetTickCount64();
  meta<<std::setprecision(17)<<"{\"method\":\"WASAPI process tree INCLUDE only; no microphone or other-process mix\",\"targetPid\":"<<pid<<",\"sampleRate\":44100,\"channels\":2,\"bits\":16,\"originUnixMs\":"<<originWall<<",\"originQpc100ns\":"<<originQpc<<",\"packets\":[";
  ok(client->Start());std::cout<<std::setprecision(17)<<"{\"status\":\"recording\",\"targetPid\":"<<pid<<",\"originUnixMs\":"<<originWall<<"}"<<std::endl;
  uint64_t framesWritten=0,packets=0;unsigned discontinuities=0;std::vector<BYTE> zeros;bool stop=false,requested=false,targetExited=false;
  while(!stop&&GetTickCount64()-tick<ULONGLONG(seconds)*1000){
   WaitForSingleObject(samples.h,100);UINT32 available=0;ok(capture->GetNextPacketSize(&available));
   while(available){BYTE* data=nullptr;UINT32 frames=0;DWORD flags=0;UINT64 position=0,qpc=0;ok(capture->GetBuffer(&data,&frames,&flags,&position,&qpc));
    if(packets++)meta<<',';meta<<"["<<framesWritten<<','<<frames<<','<<flags<<','<<position<<','<<qpc<<"]";
    if(flags&AUDCLNT_BUFFERFLAGS_DATA_DISCONTINUITY)discontinuities++;
    const size_t bytes=size_t(frames)*format.nBlockAlign;if(flags&AUDCLNT_BUFFERFLAGS_SILENT){zeros.assign(bytes,0);data=zeros.data();}
    if(!data){capture->ReleaseBuffer(frames);throw E_POINTER;}wav.write(reinterpret_cast<char*>(data),bytes);framesWritten+=frames;ok(capture->ReleaseBuffer(frames));ok(capture->GetNextPacketSize(&available));
   }
   requested=GetFileAttributesW(argv[3])!=INVALID_FILE_ATTRIBUTES;targetExited=WaitForSingleObject(process.h,0)==WAIT_OBJECT_0;stop=requested||targetExited;
  }
  ok(client->Stop());const double ended=wallMs();const uint32_t bytes=uint32_t(framesWritten*4);wav.seekp(4);number(wav,bytes+36);wav.seekp(40);number(wav,bytes);wav.flush();if(!wav)throw E_FAIL;wav.close();if(wav.fail())throw E_FAIL;
  meta<<"],\"frames\":"<<framesWritten<<",\"discontinuities\":"<<discontinuities<<",\"endedUnixMs\":"<<ended<<",\"stopRequested\":"<<(requested?"true":"false")<<",\"stopReason\":\""<<(targetExited?"target-exited":requested?"requested-stop":"duration-limit")<<"\"}\n";meta.flush();if(!meta)throw E_FAIL;meta.close();if(meta.fail())throw E_FAIL;
  std::cout<<"{\"status\":\"complete\",\"frames\":"<<framesWritten<<",\"packets\":"<<packets<<",\"discontinuities\":"<<discontinuities<<"}"<<std::endl;return 0;
 }catch(HRESULT hr){std::cerr<<"{\"status\":\"failed\",\"hresult\":\"0x"<<std::hex<<unsigned(hr)<<"\"}"<<std::endl;return 1;}
}
