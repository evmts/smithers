//! Public session relay validation: invalid envelopes must not consume output.
use smithers_machined::{
    conn::Frame,
    credit::{INITIAL_CREDIT, MAX_DATA},
    session_stream::{Input, Pipe},
};
use std::io::{self, Write};

// Relay never writes stdin; the sink supplies the unrelated input capability.
struct Sink;
impl Write for Sink {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
impl Input for Sink {
    fn eof(&mut self) -> io::Result<()> {
        Ok(())
    }
    fn resize(&mut self, _: u16, _: u16) -> io::Result<()> {
        Ok(())
    }
    fn signal(&mut self, _: u8) -> io::Result<()> {
        Ok(())
    }
    fn close(&mut self) -> io::Result<()> {
        Ok(())
    }
}
fn output(size: usize) -> Frame {
    Frame {
        kind: 5,
        stream: 17,
        payload: [&[1, 1][..], &vec![42; size]].concat(),
    }
}

#[test]
fn oversized_relay_is_rejected_without_losing_bytes_or_credit() {
    let mut pipe = Pipe::new(17, Sink, false).unwrap();
    let oversized = output(MAX_DATA + 1);
    assert!(oversized.encode().is_err());
    assert!(pipe.relay(&oversized).is_err());
    assert_eq!(pipe.available(), INITIAL_CREDIT);
    assert!(pipe.attach(0).unwrap().1.is_empty());

    let maximum = output(MAX_DATA);
    assert_eq!(pipe.relay(&maximum).unwrap(), Some(maximum.clone()));
    assert_eq!(pipe.available(), INITIAL_CREDIT - MAX_DATA);
    assert_eq!(pipe.attach(0).unwrap().1, vec![maximum]);
}

#[test]
fn malformed_relay_controls_are_rejected_before_terminal_state_changes() {
    let mut pipe = Pipe::new(17, Sink, false).unwrap();
    for payload in [vec![5], vec![5, 2], vec![6], vec![6, 0, 0, 0, 0]] {
        let frame = Frame {
            kind: 5,
            stream: 17,
            payload,
        };
        assert!(frame.encode().is_err());
        assert!(pipe.relay(&frame).is_err());
        assert_eq!(pipe.available(), INITIAL_CREDIT);
        assert!(pipe.attach(0).unwrap().1.is_empty());
    }
}

#[test]
fn relay_refusals_preserve_existing_replay() {
    let mut pipe = Pipe::new(17, Sink, false).unwrap();
    let first = output(MAX_DATA);
    pipe.relay(&first).unwrap();
    for frame in [
        Frame {
            stream: 18,
            ..output(1)
        },
        Frame {
            kind: 6,
            ..output(1)
        },
        Frame {
            payload: vec![1, 2, 42],
            ..output(1)
        },
        Frame {
            payload: vec![2, 1, 0],
            ..output(1)
        },
    ] {
        assert!(pipe.relay(&frame).is_err());
        assert_eq!(pipe.available(), INITIAL_CREDIT - MAX_DATA);
        assert_eq!(pipe.attach(0).unwrap().1, vec![first.clone()]);
    }
    for _ in 0..3 {
        pipe.relay(&first).unwrap();
    }
    assert_eq!(pipe.available(), 0);
    assert!(pipe.relay(&output(1)).is_err());
    let replay = pipe.attach(0).unwrap().1;
    assert_eq!(replay, vec![first; 4]);
    pipe.close().unwrap();
    assert!(pipe.relay(&output(1)).is_err());
}
