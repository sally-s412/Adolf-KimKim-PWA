"""Safe presentation of speech upstream failures; no AI configuration changes."""
class SpeechServiceError(RuntimeError):
    def __init__(self, status=502):
        self.status = status
        super().__init__(speech_error_message(status))

def speech_error_message(status, language="en"):
    vi = language == "vi"
    if status in (408, 504):
        return ("Xử lý âm thanh quá thời gian chờ. Vui lòng thử lại sau."
                if vi else "Audio processing timed out. Please try again later.")
    if status == 413:
        return ("Dịch vụ AI từ chối vì tệp âm thanh quá lớn. Hãy chia nhỏ tệp và thử lại."
                if vi else "The AI service rejected this audio file as too large. Split the file and try again.")
    if status == 429:
        return ("Dịch vụ AI đang quá tải. Vui lòng thử lại sau."
                if vi else "The AI service is busy. Please try again later.")
    return ("Chưa xử lý được âm thanh vì dịch vụ chuyển giọng nói thành văn bản đang gián đoạn. Vui lòng thử lại khi dịch vụ AI hoạt động trở lại."
            if vi else "The speech-to-text service is temporarily unavailable. Please try again when the AI service is back online.")
